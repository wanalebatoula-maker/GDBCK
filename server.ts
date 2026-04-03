import express from "express";
import { createServer as createViteServer } from "vite";
import twilio from "twilio";
import path from "path";
import "dotenv/config";
import { google } from "googleapis";
import cookieParser from "cookie-parser";

let twilioClient: twilio.Twilio | null = null;

function getTwilioClient() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error("Les identifiants Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) sont manquants dans les variables d'environnement.");
    }
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/auth/google/callback`
  );

  // Google Auth URL
  app.get("/api/auth/google/url", (req, res) => {
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    res.json({ url });
  });

  // Google Auth Callback
  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Store tokens in a cookie
      res.cookie('google_tokens', JSON.stringify(tokens), {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentification réussie ! Cette fenêtre va se fermer.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Erreur callback Google:", error);
      res.status(500).send("Erreur d'authentification");
    }
  });

  // Create a new Google Spreadsheet
  app.post("/api/sheets/create", async (req, res) => {
    const tokensCookie = req.cookies.google_tokens;
    if (!tokensCookie) {
      return res.status(401).json({ error: "Non authentifié avec Google" });
    }

    const { title } = req.body;
    const spreadsheetTitle = title || "Suivi Scolaire - Gestion des Elèves";

    try {
      const tokens = JSON.parse(tokensCookie);
      oauth2Client.setCredentials(tokens);

      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      
      // Create the spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: spreadsheetTitle,
          },
          sheets: [
            {
              properties: {
                title: 'Eleves',
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              data: [
                {
                  startRow: 0,
                  startColumn: 0,
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: 'ID' } },
                        { userEnteredValue: { stringValue: 'Nom' } },
                        { userEnteredValue: { stringValue: 'Classe' } },
                        { userEnteredValue: { stringValue: 'Genre' } },
                        { userEnteredValue: { stringValue: 'Téléphone' } },
                        { userEnteredValue: { stringValue: 'Date Inscription' } },
                        { userEnteredValue: { stringValue: 'Date Synchro' } },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              properties: {
                title: 'Paiements',
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              data: [
                {
                  startRow: 0,
                  startColumn: 0,
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: 'ID' } },
                        { userEnteredValue: { stringValue: 'Nom Elève' } },
                        { userEnteredValue: { stringValue: 'Montant' } },
                        { userEnteredValue: { stringValue: 'Type' } },
                        { userEnteredValue: { stringValue: 'Date' } },
                        { userEnteredValue: { stringValue: 'Année Académique' } },
                        { userEnteredValue: { stringValue: 'Date Synchro' } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      res.json({ success: true, spreadsheetId: spreadsheet.data.spreadsheetId });
    } catch (error: any) {
      console.error("Erreur création Google Sheets:", error);
      res.status(500).json({ error: "Erreur lors de la création du fichier Google Sheets", details: error.message });
    }
  });

  // Append to Google Sheet
  app.post("/api/sheets/append", async (req, res) => {
    const tokensCookie = req.cookies.google_tokens;
    if (!tokensCookie) {
      return res.status(401).json({ error: "Non authentifié avec Google" });
    }

    const { spreadsheetId, range, values } = req.body;
    if (!spreadsheetId || !range || !values) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    try {
      const tokens = JSON.parse(tokensCookie);
      oauth2Client.setCredentials(tokens);

      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      
      const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [values],
        },
      });

      res.json({ success: true, data: result.data });
    } catch (error: any) {
      console.error("Erreur Google Sheets:", error);
      res.status(500).json({ error: "Erreur lors de l'ajout à Google Sheets", details: error.message });
    }
  });

  // API Route to send SMS
  app.post("/api/send-sms", async (req, res) => {
    try {
      const { to, message } = req.body;
      
      if (!to || !message) {
        return res.status(400).json({ error: "Le numéro de destinataire et le message sont requis." });
      }

      // Basic phone number normalization: ensure it starts with '+'
      let formattedTo = to.trim();
      if (!formattedTo.startsWith('+')) {
        // If it looks like a local Cameroon number (9 digits starting with 6), add +237
        const cleanTo = formattedTo.replace(/\D/g, '');
        if (cleanTo.length === 9 && cleanTo.startsWith('6')) {
          formattedTo = '+237' + cleanTo;
        } else {
          formattedTo = '+' + cleanTo;
        }
      }

      const client = getTwilioClient();
      const from = process.env.TWILIO_PHONE_NUMBER;

      if (!from) {
        return res.status(500).json({ error: "Le numéro d'expéditeur (TWILIO_PHONE_NUMBER) est manquant dans la configuration serveur." });
      }

      const result = await client.messages.create({
        body: message,
        from,
        to: formattedTo
      });

      console.log(`SMS envoyé avec succès à ${formattedTo}. SID: ${result.sid}`);
      res.json({ success: true, messageId: result.sid });
    } catch (error: any) {
      console.error("Erreur d'envoi SMS:", error);
      
      let errorMessage = "Échec de l'envoi du SMS.";
      if (error.code === 21211) errorMessage = "Le numéro de téléphone du destinataire est invalide.";
      if (error.code === 21608) errorMessage = "Le numéro de téléphone n'est pas vérifié dans votre compte Twilio d'essai.";
      if (error.code === 21408) errorMessage = "Permission refusée pour envoyer des SMS vers cette région.";
      
      res.status(500).json({ 
        error: errorMessage,
        details: error.message 
      });
    }
  });

  // Vite middleware setup for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
