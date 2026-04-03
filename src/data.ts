export interface Subject {
  id: string;
  name: string;
  group: string;
  coefficient?: number;
}

export interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  trimester: 1 | 2 | 3;
  academicYear: string;
  evaluations: {
    ecrit: { note: string; coefficient: number }[];
    oral: string[];
    s_etre: string[];
    tp: string[];
  };
  cote: string;
  observation: string;
}

export interface ReportCard {
  id: string;
  studentId: string;
  academicYear: string;
  trimester: number;
  discipline: {
    absences: number;
    retards: number;
    retenues: number;
    blameCond: number;
    blameTravail: number;
    avertCond: number;
    avertTravail: number;
    exclusion: number;
  };
  appreciation: string;
  average?: string;
  rank?: number;
  classAverage?: string;
  decision?: string;
}

export interface AppUser {
  id: string;
  email: string;
  role: 'admin' | 'staff' | 'teacher';
  name?: string;
  assignedClasses?: string[];
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  academicYear: string;
}

export interface TeacherAttendanceRecord {
  id: string;
  teacherId: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  academicYear: string;
}

export interface Student {
  id: string;
  name: string;
  class: string;
  dob?: string;
  pob?: string;
  gender: string;
  phone?: string;
  email?: string;
  status: string;
  regDate: string;
  regFee: number;
  tranche1: number;
  tranche2: number;
  remainingTr1: number;
  remainingTr2: number;
  totalRemaining: number;
  discount?: number;
  academicYear: string;
  tranche1Deadline?: string;
  tranche2Deadline?: string;
}

export interface Expense {
  id: string;
  type: 'fonctionnement' | 'salaire' | 'travaux' | 'banque' | 'cotisation';
  description: string;
  amount: number;
  date?: string;
  academicYear: string;
  teacherId?: string;
  month?: string;
}

export interface Funding {
  id: string;
  source: string;
  amount: number;
  academicYear: string;
}

export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  date: string;
  type: 'inscription' | 'tranche1' | 'tranche2';
  academicYear: string;
}

export interface Discount {
  id: string;
  name: string;
  type: 'amount' | 'percentage';
  value: number;
}

export interface SchoolConfig {
  registrationFee: number;
  tranche1Fee: number;
  tranche2Fee: number;
  tranche2FeeMaternelle: number;
  classes: string[];
  tranche1Deadline?: string;
  tranche2Deadline?: string;
  academicYears: string[];
  currentAcademicYear: string;
  archivedYears: string[];
  discounts?: Discount[];
  schoolName?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolLogo?: string;
  reminderThreshold?: number;
  whatsappTemplate?: string;
  paymentConfirmationTemplate?: string;
  subjects?: Subject[];
  theme?: 'default' | 'dark' | 'warm' | 'professional';
  spreadsheetId?: string;
}

export const INITIAL_CONFIG: SchoolConfig = {
  registrationFee: 5000,
  tranche1Fee: 40000,
  tranche2Fee: 15000,
  tranche2FeeMaternelle: 20000,
  classes: ['PS', 'MS', 'GS', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
  tranche1Deadline: '31/10/2025',
  tranche2Deadline: '31/12/2025',
  academicYears: ['2025-2026'],
  currentAcademicYear: '2025-2026',
  archivedYears: [],
  discounts: [
    { id: 'd1', name: 'Fratrie (10%)', type: 'percentage', value: 10 },
    { id: 'd2', name: 'Excellence (5000 FCFA)', type: 'amount', value: 5000 },
    { id: 'd3', name: 'Réduction (50%)', type: 'percentage', value: 50 }
  ],
  schoolName: 'Mon École',
  schoolAddress: 'Adresse de l\'école',
  schoolPhone: '+237 600 000 000',
  schoolEmail: 'contact@ecole.com',
  schoolLogo: '',
  reminderThreshold: 7,
  theme: 'default',
  whatsappTemplate: 'Cher parent, nous vous rappelons que le solde de [NOM_ELEVE] est de [MONTANT_RESTANT] FCFA. Merci de régulariser avant le [DATE_LIMITE].',
  paymentConfirmationTemplate: 'Reçu de paiement pour [NOM_ELEVE]. Montant versé: [MONTANT_PAYE] FCFA. Reste à payer: Tranche 1: [RESTE_T1] FCFA (Echéance: [ECHEANCE_T1]), Tranche 2: [RESTE_T2] FCFA (Echéance: [ECHEANCE_T2]), Total: [TOTAL_RESTANT] FCFA. Merci!',
  subjects: [
    // Domaine 1: LANGUE FRANÇAISE
    { id: 's1', name: 'Communication Orale', group: 'LANGUE FRANÇAISE', coefficient: 1 },
    { id: 's2', name: 'Lecture', group: 'LANGUE FRANÇAISE', coefficient: 2 },
    { id: 's3', name: 'Écriture / Graphisme', group: 'LANGUE FRANÇAISE', coefficient: 1 },
    { id: 's4', name: 'Dictée', group: 'LANGUE FRANÇAISE', coefficient: 2 },
    { id: 's5', name: 'Grammaire', group: 'LANGUE FRANÇAISE', coefficient: 1 },
    { id: 's6', name: 'Conjugaison', group: 'LANGUE FRANÇAISE', coefficient: 1 },
    { id: 's7', name: 'Vocabulaire', group: 'LANGUE FRANÇAISE', coefficient: 1 },
    { id: 's8', name: 'Expression Écrite', group: 'LANGUE FRANÇAISE', coefficient: 2 },
    
    // Domaine 2: MATHÉMATIQUES
    { id: 's9', name: 'Activités Numériques', group: 'MATHÉMATIQUES', coefficient: 3 },
    { id: 's10', name: 'Activités Géométriques', group: 'MATHÉMATIQUES', coefficient: 1 },
    { id: 's11', name: 'Activités de Mesure', group: 'MATHÉMATIQUES', coefficient: 1 },
    { id: 's12', name: 'Résolution de Problèmes', group: 'MATHÉMATIQUES', coefficient: 3 },
    
    // Domaine 3: SCIENCES ET TECHNOLOGIES
    { id: 's13', name: 'Sciences', group: 'SCIENCES ET TECHNOLOGIES', coefficient: 2 },
    { id: 's14', name: 'TIC', group: 'SCIENCES ET TECHNOLOGIES', coefficient: 1 },
    
    // Domaine 4: SCIENCES HUMAINES
    { id: 's15', name: 'Histoire', group: 'SCIENCES HUMAINES', coefficient: 1 },
    { id: 's16', name: 'Géographie', group: 'SCIENCES HUMAINES', coefficient: 1 },
    { id: 's17', name: 'Éducation Civique et Morale', group: 'SCIENCES HUMAINES', coefficient: 1 },
    
    // Domaine 5: LANGUE NATIONALE ET CULTURE
    { id: 's18', name: 'Langue Nationale', group: 'LANGUE NATIONALE ET CULTURE', coefficient: 1 },
    { id: 's19', name: 'Culture Nationale', group: 'LANGUE NATIONALE ET CULTURE', coefficient: 1 },
    
    // Domaine 6: DÉVELOPPEMENT DE LA PERSONNE
    { id: 's20', name: 'EPS', group: 'DÉVELOPPEMENT DE LA PERSONNE', coefficient: 2 },
    { id: 's21', name: 'Éducation Artistique', group: 'DÉVELOPPEMENT DE LA PERSONNE', coefficient: 1 },
    { id: 's22', name: 'Travail Manuel', group: 'DÉVELOPPEMENT DE LA PERSONNE', coefficient: 1 }
  ]
};

export const INITIAL_STUDENTS: Student[] = [
  {
    id: '1',
    name: 'Aboubakar Brahim',
    class: 'CE1',
    gender: 'G',
    status: 'A',
    regDate: '01/09/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 15000,
    remainingTr1: 0,
    remainingTr2: 0,
    totalRemaining: 0,
    academicYear: '2025-2026'
  },
  {
    id: '2',
    name: 'Adamou Junior Gabriel',
    class: 'CE1',
    gender: 'G',
    status: 'A',
    regDate: '01/09/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 10000,
    remainingTr1: 5000,
    remainingTr2: 5000,
    totalRemaining: 10000,
    academicYear: '2025-2026'
  },
  {
    id: '3',
    name: 'Aminatou Issa',
    class: 'CE1',
    gender: 'F',
    status: 'A',
    regDate: '10/09/2025',
    regFee: 5000,
    tranche1: 30000,
    tranche2: 0,
    remainingTr1: 10000,
    remainingTr2: 15000,
    totalRemaining: 25000,
    academicYear: '2025-2026'
  },
  {
    id: '4',
    name: 'Ange Rayé',
    class: 'CE1',
    dob: '30/5/2018',
    pob: 'Ngaoundere',
    gender: 'F',
    phone: '696070152',
    status: 'A',
    regDate: '29/09/2025',
    regFee: 5000,
    tranche1: 0,
    tranche2: 15000,
    remainingTr1: 40000,
    remainingTr2: 0,
    totalRemaining: 40000,
    academicYear: '2025-2026'
  },
  {
    id: '5',
    name: 'Dessé Sodea Bobbo Étienne',
    class: 'CE1',
    dob: '27/2/2017',
    pob: 'ngaoundere',
    gender: 'G',
    phone: '693813340',
    status: 'A',
    regDate: '08/09/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 0,
    remainingTr1: 0,
    remainingTr2: 15000,
    totalRemaining: 15000,
    academicYear: '2025-2026'
  },
  {
    id: '6',
    name: 'Dia Sakina Aboubakar',
    class: 'CE1',
    dob: '20/1/2016',
    pob: 'Ngaoundere',
    gender: 'F',
    phone: '690110744',
    status: 'N',
    regDate: '22/09/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 15000,
    remainingTr1: 0,
    remainingTr2: 0,
    totalRemaining: 0,
    academicYear: '2025-2026'
  },
  {
    id: '7',
    name: 'Djelassem Noudjikem Jean de Dieu',
    class: 'CE1',
    dob: '5/3/2018',
    pob: 'figuil',
    gender: 'G',
    phone: '694024642',
    status: 'A',
    regDate: '25/08/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 0,
    remainingTr1: 0,
    remainingTr2: 15000,
    totalRemaining: 15000,
    academicYear: '2025-2026'
  },
  {
    id: '8',
    name: 'Andre sina',
    class: 'CE2',
    gender: 'G',
    status: 'N',
    regDate: '25/08/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 10000,
    remainingTr1: 0,
    remainingTr2: 5000,
    totalRemaining: 5000,
    academicYear: '2025-2026'
  },
  {
    id: '9',
    name: 'Awouia Alida',
    class: 'CE2',
    dob: '21/6/2016',
    pob: 'Ngaoundere',
    gender: 'F',
    phone: '692448981',
    status: 'A',
    regDate: '16/09/2025',
    regFee: 5000,
    tranche1: 20000,
    tranche2: 0,
    remainingTr1: 20000,
    remainingTr2: 15000,
    totalRemaining: 35000,
    academicYear: '2025-2026'
  },
  {
    id: '10',
    name: 'Abbo Mohaman',
    class: 'CM1',
    dob: '11/12/2016',
    pob: 'Ngaoundere',
    gender: 'G',
    phone: '691259891',
    status: 'A',
    regDate: '10/09/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 0,
    remainingTr1: 0,
    remainingTr2: 15000,
    totalRemaining: 15000,
    academicYear: '2025-2026'
  },
  {
    id: '11',
    name: 'Apeke Marcel Steve',
    class: 'CM2',
    dob: '25/2/2014',
    pob: 'Douala',
    gender: 'G',
    phone: '656744816',
    status: 'A',
    regDate: '25/08/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 15000,
    remainingTr1: 0,
    remainingTr2: 0,
    totalRemaining: 0,
    academicYear: '2025-2026'
  },
  {
    id: '12',
    name: 'Basilia Zomita La jolie Ingride',
    class: 'GS',
    dob: '11/10/2020',
    gender: 'F',
    phone: '693611916',
    status: 'A',
    regDate: '08/09/2025',
    regFee: 5000,
    tranche1: 40000,
    tranche2: 20000,
    remainingTr1: 0,
    remainingTr2: 0,
    totalRemaining: 0,
    academicYear: '2025-2026'
  }
];

export const INITIAL_EXPENSES: Expense[] = [
  { id: 'e1', type: 'fonctionnement', description: 'Impression des tracts', amount: 10000, academicYear: '2025-2026', date: '01/09/2025' },
  { id: 'e2', type: 'fonctionnement', description: 'Échantillon tenue', amount: 7000, academicYear: '2025-2026', date: '05/09/2025' },
  { id: 'e3', type: 'fonctionnement', description: 'Donné à Mr kadia pour l\'évaluation', amount: 10000, academicYear: '2025-2026', date: '15/09/2025' },
  { id: 'e4', type: 'fonctionnement', description: 'Photocopie fournitures + documents officiels', amount: 7000, academicYear: '2025-2026', date: '20/09/2025' },
  { id: 's1', type: 'salaire', description: 'Salaire directrice Août', amount: 80000, academicYear: '2025-2026', date: '30/08/2025' },
  { id: 's2', type: 'salaire', description: 'Donné aux enseignants', amount: 50000, academicYear: '2025-2026', date: '05/09/2025' },
  { id: 's3', type: 'salaire', description: 'Salaire septembre', amount: 390000, academicYear: '2025-2026', date: '30/09/2025' },
  { id: 's4', type: 'salaire', description: 'Salaire mois d\'octobre', amount: 620000, academicYear: '2025-2026', date: '30/10/2025' },
  { id: 't1', type: 'travaux', description: 'Portail de l\'école', amount: 200000, academicYear: '2025-2026', date: '10/09/2025' },
  { id: 't2', type: 'travaux', description: 'Banc primaire', amount: 127500, academicYear: '2025-2026', date: '15/09/2025' },
  { id: 't3', type: 'travaux', description: 'Plomberie', amount: 23000, academicYear: '2025-2026', date: '20/09/2025' },
  { id: 't4', type: 'travaux', description: 'Bancs maternelles', amount: 45000, academicYear: '2025-2026', date: '25/09/2025' },
];

export const INITIAL_FUNDING: Funding[] = [
  { id: 'f1', source: 'FONDATEUR', amount: 50000, academicYear: '2025-2026' },
  { id: 'f2', source: 'BANQUE', amount: 600000, academicYear: '2025-2026' },
  { id: 'f3', source: 'BANQUE', amount: 1000000, academicYear: '2025-2026' },
];

export const INITIAL_PAYMENTS: Payment[] = [
  { id: 'p1', studentId: '1', studentName: 'Aboubakar Brahim', amount: 5000, date: '01/09/2025', type: 'inscription', academicYear: '2025-2026' },
  { id: 'p2', studentId: '1', studentName: 'Aboubakar Brahim', amount: 40000, date: '05/09/2025', type: 'tranche1', academicYear: '2025-2026' },
  { id: 'p3', studentId: '1', studentName: 'Aboubakar Brahim', amount: 15000, date: '10/10/2025', type: 'tranche2', academicYear: '2025-2026' },
  { id: 'p4', studentId: '2', studentName: 'Adamou Junior Gabriel', amount: 5000, date: '01/09/2025', type: 'inscription', academicYear: '2025-2026' },
  { id: 'p5', studentId: '2', studentName: 'Adamou Junior Gabriel', amount: 40000, date: '15/09/2025', type: 'tranche1', academicYear: '2025-2026' },
  { id: 'p6', studentId: '3', studentName: 'Aminatou Issa', amount: 5000, date: '10/09/2025', type: 'inscription', academicYear: '2025-2026' },
  { id: 'p7', studentId: '3', studentName: 'Aminatou Issa', amount: 30000, date: '20/09/2025', type: 'tranche1', academicYear: '2025-2026' },
  { id: 'p8', studentId: '4', studentName: 'Ange Rayé', amount: 5000, date: '29/09/2025', type: 'inscription', academicYear: '2025-2026' },
  { id: 'p9', studentId: '5', studentName: 'Dessé Sodea Bobbo Étienne', amount: 5000, date: '08/09/2025', type: 'inscription', academicYear: '2025-2026' },
  { id: 'p10', studentId: '5', studentName: 'Dessé Sodea Bobbo Étienne', amount: 40000, date: '15/09/2025', type: 'tranche1', academicYear: '2025-2026' },
];
