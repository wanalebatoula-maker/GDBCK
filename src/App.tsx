/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, Component } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  Search, 
  Settings,
  Menu,
  Filter, 
  Plus, 
  TrendingDown, 
  TrendingUp, 
  GraduationCap,
  ChevronRight,
  Download,
  DollarSign,
  UserPlus,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Receipt,
  X,
  LogOut,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Bell,
  CheckCircle2,
  CheckCircle,
  Calendar,
  Archive,
  BarChart3,
  Edit2,
  Printer,
  Send,
  Mail,
  FileUp,
  MessageCircle,
  MessageSquare,
  Heart,
  FlaskConical,
  PieChart as PieChartIcon,
  Building,
  Wifi,
  WifiOff,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  BarChart, 
  Bar, 
  PieChart,
  Pie,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { useReactToPrint } from 'react-to-print';
import { INITIAL_STUDENTS, INITIAL_EXPENSES, INITIAL_FUNDING, INITIAL_CONFIG, INITIAL_PAYMENTS, Student, Expense, SchoolConfig, Payment, AppUser, AttendanceRecord, TeacherAttendanceRecord, Grade, ReportCard } from './data';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Error Handling Spec for Firestore Permissions
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if ((this as any).state.hasError) {
      let errorMessage = "Une erreur est survenue.";
      try {
        if ((this as any).state.error?.message) {
          const parsed = JSON.parse((this as any).state.error.message);
          if (parsed.error && parsed.error.includes("insufficient permissions")) {
            errorMessage = "Permissions insuffisantes pour effectuer cette opération.";
          }
        }
      } catch (e) {
        // Not a JSON error
      }
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Oups !</h2>
            <p className="text-slate-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

type View = 'dashboard' | 'students' | 'attendance' | 'payments' | 'finances' | 'grades' | 'settings';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  date: string;
  read: boolean;
  action?: () => void;
}

const calculateExpectedTranches = (studentClass: string, config: SchoolConfig, discount: number = 0) => {
  const isMaternelle = studentClass === 'GS' || studentClass === 'PS' || studentClass.toLowerCase().includes('maternelle');
  const baseTr1 = config.tranche1Fee;
  const baseTr2 = isMaternelle ? (config.tranche2FeeMaternelle || 20000) : config.tranche2Fee;
  
  let expectedTr1 = baseTr1;
  let expectedTr2 = baseTr2;
  
  if (discount > 0) {
    const total = baseTr1 + baseTr2;
    if (total > 0) {
      const safeDiscount = Math.min(discount, total);
      const ratio = (total - safeDiscount) / total;
      expectedTr1 = Math.round(baseTr1 * ratio);
      expectedTr2 = Math.round(baseTr2 * ratio);
      
      // Adjust rounding errors to match total exactly
      const finalTotal = expectedTr1 + expectedTr2;
      const targetTotal = Math.max(0, total - safeDiscount);
      if (finalTotal !== targetTotal) {
        expectedTr1 += (targetTotal - finalTotal);
      }
    } else {
      expectedTr1 = 0;
      expectedTr2 = 0;
    }
  }
  
  return { expectedTr1, expectedTr2 };
};

const isOverdue = (deadlineStr?: string) => {
  if (!deadlineStr) return false;
  const [day, month, year] = deadlineStr.split('/').map(Number);
  const deadline = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > deadline;
};

const getStudentPaymentStatus = (student: Student, config: SchoolConfig) => {
  if (student.totalRemaining === 0) return 'Paid';
  const tr1Overdue = student.remainingTr1 > 0 && isOverdue(student.tranche1Deadline || config.tranche1Deadline);
  const tr2Overdue = student.remainingTr2 > 0 && isOverdue(student.tranche2Deadline || config.tranche2Deadline);
  if (tr1Overdue || tr2Overdue) return 'Overdue';
  return 'Pending';
};

// Helper to send WhatsApp message
const sendWhatsAppMessage = (phone: string, message: string) => {
  if (!phone) {
    alert("Aucun numéro de téléphone n'est configuré pour cet élève.");
    return;
  }
  // Remove non-numeric characters
  const cleanPhone = phone.replace(/\D/g, '');
  // Ensure it has a country code (default to +237 if not present and starts with 6)
  let finalPhone = cleanPhone;
  if (cleanPhone.length === 9 && cleanPhone.startsWith('6')) {
    finalPhone = '237' + cleanPhone;
  }
  const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

// Helper to send SMS message
const sendSMSMessage = async (phone: string, message: string) => {
  if (!phone) {
    alert("Aucun numéro de téléphone n'est configuré pour cet élève.");
    return;
  }
  
  // Remove non-numeric characters
  const cleanPhone = phone.replace(/\D/g, '');
  // Ensure it has a country code (default to +237 if not present and starts with 6)
  let finalPhone = cleanPhone;
  if (cleanPhone.length === 9 && cleanPhone.startsWith('6')) {
    finalPhone = '+237' + cleanPhone;
  } else if (!finalPhone.startsWith('+')) {
    finalPhone = '+' + finalPhone;
  }

  try {
    const response = await fetch('/api/send-sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: finalPhone, message }),
    });

    const data = await response.json();

    if (data.success) {
      alert("SMS envoyé avec succès !");
    } else {
      alert("Erreur lors de l'envoi du SMS : " + (data.error || "Erreur inconnue"));
    }
  } catch (error) {
    console.error("SMS Error:", error);
    alert("Erreur de connexion lors de l'envoi du SMS.");
  }
};

const calculateEcritAverage = (ecrit: any[], studentClass?: string) => {
  if (!ecrit || ecrit.length === 0) return 0;
  
  const isMaternelle = studentClass && ['PS', 'MS', 'GS'].includes(studentClass);
  
  if (isMaternelle) {
    // For nursery, we return the most recent non-empty grade or a "cote"
    const validCotes = ecrit
      .map(e => (typeof e === 'object' ? e.note : e))
      .filter(n => n && n.trim() !== '');
    return validCotes.length > 0 ? validCotes[validCotes.length - 1] : '';
  }

  let totalPoints = 0;
  let totalCoefficients = 0;
  let hasValidNote = false;

  ecrit.forEach(e => {
    if (typeof e === 'object' && e !== null && 'note' in e) {
      const note = Number(e.note);
      if (!isNaN(note)) {
        totalPoints += note * (e.coefficient || 1);
        totalCoefficients += (e.coefficient || 1);
        hasValidNote = true;
      }
    } else {
      const note = Number(e);
      if (!isNaN(note)) {
        totalPoints += note;
        totalCoefficients += 1;
        hasValidNote = true;
      }
    }
  });

  if (!hasValidNote || totalCoefficients === 0) return 0;
  return totalPoints / totalCoefficients;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isCreatingSpreadsheet, setIsCreatingSpreadsheet] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsGoogleConnected(true);
        const newNotif: AppNotification = {
          id: Date.now().toString(),
          title: 'Google Sheets Connecté',
          message: 'Votre compte Google a été lié avec succès pour la synchronisation.',
          type: 'success',
          date: new Date().toLocaleDateString(),
          read: false
        };
        setNotifications(prev => [newNotif, ...prev]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const newNotif: AppNotification = {
        id: Date.now().toString(),
        title: 'Connexion rétablie',
        message: 'Vous êtes de nouveau en ligne. Vos données sont en cours de synchronisation.',
        type: 'success',
        date: new Date().toLocaleDateString(),
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
    };
    const handleOffline = () => {
      setIsOnline(false);
      const newNotif: AppNotification = {
        id: Date.now().toString(),
        title: 'Mode hors connexion',
        message: 'Vous êtes hors ligne. Vous pouvez continuer à travailler, les modifications seront synchronisées une fois la connexion rétablie.',
        type: 'warning',
        date: new Date().toLocaleDateString(),
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [students, setStudents] = useState<Student[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendanceRecord[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [attendanceTab, setAttendanceTab] = useState<'students' | 'teachers'>('students');
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedAttendanceClass, setSelectedAttendanceClass] = useState('');
  const [config, setConfig] = useState<SchoolConfig>(INITIAL_CONFIG);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const isArchivedYear = config.archivedYears?.includes(selectedYear) || false;
  const prevStudentsRef = React.useRef<Student[]>([]);
  const prevPaymentsRef = React.useRef<Payment[]>([]);
  const prevExpensesRef = React.useRef<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All');
  const [paymentStartDate, setPaymentStartDate] = useState('');
  const [paymentEndDate, setPaymentEndDate] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<Payment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderModalInitialType, setReminderModalInitialType] = useState<'upcoming' | 'overdue'>('overdue');
  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<Student | null>(null);
  const [financeTab, setFinanceTab] = useState<'overview' | 'salaries' | 'cotisations'>('overview');
  const [salaryTeacherFilter, setSalaryTeacherFilter] = useState<string>('All');
  const [selectedGradeTrimester, setSelectedGradeTrimester] = useState<1 | 2 | 3 | 4>(1);
  const [selectedGradeClass, setSelectedGradeClass] = useState('');
  const [selectedGradeSubject, setSelectedGradeSubject] = useState('');
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<any>(null);
  const [isReportCardListOpen, setIsReportCardListOpen] = useState(false);
  const [currentReportCardClass, setCurrentReportCardClass] = useState('');
  const [isReportCardModalOpen, setIsReportCardModalOpen] = useState(false);
  const [selectedReportCardStudent, setSelectedReportCardStudent] = useState<Student | null>(null);
  const [expenseStartDate, setExpenseStartDate] = useState('');
  const [expenseEndDate, setExpenseEndDate] = useState('');
  const [editingClass, setEditingClass] = useState<{oldName: string, newName: string} | null>(null);
  
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'staff' | 'teacher'>('staff');
  const [newUserClasses, setNewUserClasses] = useState<string[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-warm', 'theme-professional');
    if (config.theme && config.theme !== 'default') {
      root.classList.add(`theme-${config.theme}`);
    }
  }, [config.theme]);

  const isSuperAdmin = useMemo(() => {
    return user?.email === 'wanalebatoula@gmail.com';
  }, [user]);

  const currentUserData = useMemo(() => {
    return appUsers.find(u => u.email === user?.email);
  }, [user, appUsers]);

  const isAdmin = isSuperAdmin || currentUserData?.role === 'admin';
  const isStaff = isAdmin || currentUserData?.role === 'staff';
  const isTeacher = currentUserData?.role === 'teacher';
  
  const canWrite = isAdmin || isStaff;
  const canViewFinances = isAdmin || isStaff;
  const canViewSettings = isAdmin || isStaff;
  const canViewPayments = isAdmin || isStaff;
  const canViewAllStudents = isAdmin || isStaff;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'students');
    });

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'expenses');
    });

    const unsubPayments = onSnapshot(collection(db, 'payments'), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'payments');
    });

    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    });

    const unsubTeacherAttendance = onSnapshot(collection(db, 'teacher_attendance'), (snapshot) => {
      setTeacherAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeacherAttendanceRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'teacher_attendance');
    });

    const unsubGrades = onSnapshot(collection(db, 'grades'), (snapshot) => {
      setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'grades');
    });

    const unsubReportCards = onSnapshot(collection(db, 'report_cards'), (snapshot) => {
      setReportCards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReportCard)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'report_cards');
    });

    const unsubConfig = onSnapshot(doc(db, 'config', 'main'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<SchoolConfig>;
        const mergedConfig = { ...INITIAL_CONFIG, ...data };
        
        // Ensure arrays are not undefined if they were somehow null or missing in DB
        mergedConfig.classes = mergedConfig.classes || INITIAL_CONFIG.classes;
        mergedConfig.academicYears = mergedConfig.academicYears || INITIAL_CONFIG.academicYears;
        mergedConfig.archivedYears = mergedConfig.archivedYears || INITIAL_CONFIG.archivedYears;

        setConfig(mergedConfig);
        if (!selectedYear) setSelectedYear(mergedConfig.currentAcademicYear);
      } else {
        // Seed initial config
        setDoc(doc(db, 'config', 'main'), INITIAL_CONFIG);
        setSelectedYear(INITIAL_CONFIG.currentAcademicYear);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/main');
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setAppUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => {
      unsubStudents();
      unsubExpenses();
      unsubPayments();
      unsubAttendance();
      unsubTeacherAttendance();
      unsubGrades();
      unsubReportCards();
      unsubConfig();
      unsubUsers();
    };
  }, [isAuthReady, user]);

  const classes = useMemo(() => {
    const baseClasses = config.classes || [];
    if (isAdmin || isStaff) return ['All', ...baseClasses];
    if (isTeacher && currentUserData?.assignedClasses) return ['All', ...currentUserData.assignedClasses];
    return ['All'];
  }, [config.classes, isAdmin, isStaff, isTeacher, currentUserData]);

  const availableClasses = useMemo(() => {
    const baseClasses = config.classes || [];
    if (isAdmin || isStaff) return baseClasses;
    if (isTeacher && currentUserData?.assignedClasses) return currentUserData.assignedClasses;
    return [];
  }, [config.classes, isAdmin, isStaff, isTeacher, currentUserData]);

  const stats = useMemo(() => {
    let yearStudents = students.filter(s => s.academicYear === selectedYear);
    let yearExpenses = expenses.filter(e => e.academicYear === selectedYear);

    if (isTeacher && currentUserData?.assignedClasses) {
      yearStudents = yearStudents.filter(s => currentUserData.assignedClasses?.includes(s.class));
      // Teachers don't see expenses/balance
      return { 
        totalStudents: yearStudents.length, 
        totalCollected: 0, 
        totalRemaining: 0, 
        totalRemainingTr1: 0, 
        totalRemainingTr2: 0, 
        totalExpenses: 0, 
        totalCotisations: 0, 
        balance: 0 
      };
    }

    const totalStudents = yearStudents.length;
    const totalRemaining = yearStudents.reduce((acc, s) => acc + s.totalRemaining, 0);
    const totalRemainingTr1 = yearStudents.reduce((acc, s) => acc + s.remainingTr1, 0);
    const totalRemainingTr2 = yearStudents.reduce((acc, s) => acc + s.remainingTr2, 0);
    const totalExpenses = yearExpenses.filter(e => e.type !== 'cotisation').reduce((acc, e) => acc + e.amount, 0);
    const totalCotisations = yearExpenses.filter(e => e.type === 'cotisation').reduce((acc, e) => acc + e.amount, 0);
    const totalCollected = yearStudents.reduce((acc, s) => acc + s.regFee + s.tranche1 + s.tranche2, 0) + totalCotisations;
    const balance = totalCollected - totalExpenses;

    return { totalStudents, totalCollected, totalRemaining, totalRemainingTr1, totalRemainingTr2, totalExpenses, totalCotisations, balance };
  }, [students, expenses, selectedYear, isTeacher, currentUserData]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchesYear = s.academicYear === selectedYear;
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClass = classFilter === 'All' || s.class === classFilter;
      const matchesStatus = statusFilter === 'All' || s.status === statusFilter;
      const matchesAssignment = canViewAllStudents || (isTeacher && currentUserData?.assignedClasses?.includes(s.class));
      
      if (!matchesAssignment) return false;
      
      let matchesPayment = true;
      switch (paymentFilter) {
        case 'paid':
          matchesPayment = s.totalRemaining === 0;
          break;
        case 'unpaid':
          matchesPayment = s.tranche1 === 0 && s.tranche2 === 0;
          break;
        case 'partial':
          matchesPayment = s.totalRemaining > 0 && (s.tranche1 > 0 || s.tranche2 > 0);
          break;
        case 'tr1_incomplete':
          matchesPayment = s.remainingTr1 > 0;
          break;
        case 'tr2_incomplete':
          matchesPayment = s.remainingTr2 > 0;
          break;
        case 'total_incomplete':
          matchesPayment = s.totalRemaining > 0;
          break;
        case 'tr1_unpaid':
          matchesPayment = s.tranche1 === 0;
          break;
        case 'tr2_unpaid':
          matchesPayment = s.tranche2 === 0;
          break;
        case 'total_unpaid':
          matchesPayment = s.tranche1 === 0 && s.tranche2 === 0;
          break;
        default:
          matchesPayment = true;
      }

      return matchesYear && matchesSearch && matchesClass && matchesStatus && matchesPayment && (!isTeacher || (currentUserData?.assignedClasses?.includes(s.class) ?? false));
    });
  }, [students, searchTerm, classFilter, statusFilter, paymentFilter, selectedYear, isTeacher, currentUserData]);

  const chartData = useMemo(() => {
    const months = [
      { name: 'Sep', index: 8 },
      { name: 'Oct', index: 9 },
      { name: 'Nov', index: 10 },
      { name: 'Dec', index: 11 },
      { name: 'Jan', index: 0 },
      { name: 'Feb', index: 1 },
      { name: 'Mar', index: 2 },
      { name: 'Apr', index: 3 },
      { name: 'May', index: 4 },
      { name: 'Jun', index: 5 },
      { name: 'Jul', index: 6 },
      { name: 'Aug', index: 7 },
    ];

    const data = months.map(m => ({
      name: m.name,
      revenus: 0,
      depenses: 0,
      monthIndex: m.index
    }));

    payments.forEach(p => {
      if (p.academicYear !== selectedYear) return;
      const [d, m, y] = p.date.split('/').map(Number);
      const monthIdx = m - 1;
      const monthData = data.find(d => d.monthIndex === monthIdx);
      if (monthData) {
        monthData.revenus += p.amount;
      }
    });

    expenses.forEach(e => {
      if (e.academicYear !== selectedYear || !e.date) return;
      const [d, m, y] = e.date.split('/').map(Number);
      const monthIdx = m - 1;
      const monthData = data.find(d => d.monthIndex === monthIdx);
      if (monthData) {
        if (e.type === 'cotisation') {
          monthData.revenus += e.amount;
        } else {
          monthData.depenses += e.amount;
        }
      }
    });

    return data;
  }, [payments, expenses, selectedYear]);

  const classDistributionData = useMemo(() => {
    const yearStudents = students.filter(s => s.academicYear === selectedYear);
    return availableClasses.map(cls => ({
      name: cls,
      count: yearStudents.filter(s => s.class === cls).length
    })).filter(item => item.count > 0);
  }, [students, availableClasses, selectedYear]);

  const expenseCategoryData = useMemo(() => {
    const yearExpenses = expenses.filter(e => e.academicYear === selectedYear);
    const categories = [
      { name: 'Fonctionnement', type: 'fonctionnement', color: '#3b82f6' },
      { name: 'Salaires', type: 'salaire', color: '#a855f7' },
      { name: 'Travaux', type: 'travaux', color: '#f97316' },
      { name: 'Banque', type: 'banque', color: '#10b981' },
      { name: 'Cotisations', type: 'cotisation', color: '#ec4899' },
      { name: 'Autres', type: 'autre', color: '#64748b' }
    ];

    return categories.map(cat => ({
      name: cat.name,
      value: yearExpenses.filter(e => e.type === cat.type).reduce((acc, e) => acc + e.amount, 0),
      color: cat.color
    })).filter(item => item.value > 0);
  }, [expenses, selectedYear]);

  const getDaysRemaining = (deadlineStr?: string) => {
    if (!deadlineStr) return null;
    const [day, month, year] = deadlineStr.split('/').map(Number);
    const deadline = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = deadline.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const upcomingDeadlines = useMemo(() => {
    const result: { student: Student, type: 'tranche1' | 'tranche2', days: number }[] = [];
    
    students.forEach(s => {
      if (s.academicYear !== selectedYear) return;
      
      const deadline1 = s.tranche1Deadline || config.tranche1Deadline;
      if (s.remainingTr1 > 0 && deadline1) {
        const days = getDaysRemaining(deadline1);
        if (days !== null && days >= 0 && days <= (config.reminderThreshold || 7)) {
          result.push({ student: s, type: 'tranche1', days });
        }
      }
      
      const deadline2 = s.tranche2Deadline || config.tranche2Deadline;
      if (s.remainingTr2 > 0 && deadline2) {
        const days = getDaysRemaining(deadline2);
        if (days !== null && days >= 0 && days <= (config.reminderThreshold || 7)) {
          result.push({ student: s, type: 'tranche2', days });
        }
      }
    });
    
    return result.sort((a, b) => a.days - b.days);
  }, [students, config, selectedYear]);

  const overdueStudentsList = useMemo(() => {
    const result: { student: Student, type: 'tranche1' | 'tranche2', daysOverdue: number }[] = [];
    
    students.forEach(s => {
      if (s.academicYear !== selectedYear) return;
      
      const deadline1 = s.tranche1Deadline || config.tranche1Deadline;
      if (s.remainingTr1 > 0 && deadline1) {
        const days = getDaysRemaining(deadline1);
        if (days !== null && days < 0) {
          result.push({ student: s, type: 'tranche1', daysOverdue: Math.abs(days) });
        }
      }
      
      const deadline2 = s.tranche2Deadline || config.tranche2Deadline;
      if (s.remainingTr2 > 0 && deadline2) {
        const days = getDaysRemaining(deadline2);
        if (days !== null && days < 0) {
          result.push({ student: s, type: 'tranche2', daysOverdue: Math.abs(days) });
        }
      }
    });
    
    return result.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [students, config, selectedYear]);

  const addNotification = (title: string, message: string, type: 'info' | 'warning' | 'error', action?: () => void) => {
    const newNotif: AppNotification = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      type,
      date: new Date().toISOString(),
      read: false,
      action
    };
    setNotifications(prev => {
      // Avoid duplicate notifications for the same message in a short time
      if (prev.some(n => n.title === title && n.message === message && (new Date().getTime() - new Date(n.date).getTime()) < 3600000)) {
        return prev;
      }
      return [newNotif, ...prev].slice(0, 20);
    });
    
    if (notificationPermission === 'granted') {
      new Notification(title, { body: message });
    }
  };

  useEffect(() => {
    if (students.length === 0 || !config.tranche1Deadline) return;

    const checkNotifications = () => {
      const today = new Date();
      
      const parseDate = (dateStr: string) => {
        const [d, m, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d);
      };

      const t1Deadline = parseDate(config.tranche1Deadline);
      const t2Deadline = config.tranche2Deadline ? parseDate(config.tranche2Deadline) : null;

      // Overdue checks
      const overdueTr1 = students.filter(s => s.remainingTr1 > 0 && today > t1Deadline);
      const overdueTr2 = t2Deadline ? students.filter(s => s.remainingTr2 > 0 && today > t2Deadline) : [];
      
      if (overdueTr1.length > 0) {
        addNotification(
          "Retards Tranche 1",
          `${overdueTr1.length} élève(s) sont en retard pour la Tranche 1 (Date limite: ${config.tranche1Deadline}).`,
          'error'
        );
      }
      
      if (overdueTr2.length > 0) {
        addNotification(
          "Retards Tranche 2",
          `${overdueTr2.length} élève(s) sont en retard pour la Tranche 2 (Date limite: ${config.tranche2Deadline}).`,
          'error'
        );
      }

      // Upcoming checks (within 7 days)
      const checkUpcoming = (deadlineDate: Date, deadlineStr: string, label: string) => {
        const diffTime = deadlineDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0 && diffDays <= 7) {
          addNotification(
            `Échéance Proche: ${label}`,
            `La date limite pour la ${label} est dans ${diffDays === 0 ? "aujourd'hui" : diffDays + " jour(s)"} (${deadlineStr}).`,
            'warning'
          );
        }
      };

      checkUpcoming(t1Deadline, config.tranche1Deadline, "Tranche 1");
      if (t2Deadline && config.tranche2Deadline) {
        checkUpcoming(t2Deadline, config.tranche2Deadline, "Tranche 2");
      }
    };

    const timeout = setTimeout(checkNotifications, 3000);
    return () => clearTimeout(timeout);
  }, [students.length, config.tranche1Deadline, config.tranche2Deadline]);

  // Real-time notifications for new students
  useEffect(() => {
    if (students.length === 0) {
      prevStudentsRef.current = students;
      return;
    }
    
    if (prevStudentsRef.current.length > 0 && students.length > prevStudentsRef.current.length) {
      const newStudents = students.filter(s => !prevStudentsRef.current.some(ps => ps.id === s.id));
      newStudents.forEach(newStudent => {
        addNotification(
          "Nouvelle Inscription",
          `${newStudent.name} a été inscrit(e) en classe de ${newStudent.class}.`,
          'info'
        );
      });
    }
    prevStudentsRef.current = students;
  }, [students]);

  // Real-time notifications for new payments
  useEffect(() => {
    if (payments.length === 0) {
      prevPaymentsRef.current = payments;
      return;
    }
    
    if (prevPaymentsRef.current.length > 0 && payments.length > prevPaymentsRef.current.length) {
      const newPayments = payments.filter(p => !prevPaymentsRef.current.some(pp => pp.id === p.id));
      newPayments.forEach(newPayment => {
        addNotification(
          "Nouveau Paiement",
          `Un paiement de ${newPayment.amount.toLocaleString()} FCFA a été reçu pour ${newPayment.studentName} (${newPayment.type}).`,
          'info'
        );
      });
    }
    prevPaymentsRef.current = payments;
  }, [payments]);

  // Real-time notifications for new expenses
  useEffect(() => {
    if (expenses.length === 0) {
      prevExpensesRef.current = expenses;
      return;
    }
    
    if (prevExpensesRef.current.length > 0 && expenses.length > prevExpensesRef.current.length) {
      const newExpenses = expenses.filter(e => !prevExpensesRef.current.some(pe => pe.id === e.id));
      newExpenses.forEach(newExpense => {
        addNotification(
          "Nouvelle Dépense",
          `Une dépense de ${newExpense.amount.toLocaleString()} FCFA a été enregistrée (${newExpense.description}).`,
          'warning'
        );
      });
    }
    prevExpensesRef.current = expenses;
  }, [expenses]);

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Chargement...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">GSBCK GESTION</h1>
            <p className="text-slate-500 mt-2">Connectez-vous pour gérer votre établissement</p>
          </div>
          <button 
            onClick={loginWithGoogle}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Continuer avec Google
          </button>
        </div>
      </div>
    );
  }

  const exportAttendanceToExcel = () => {
    const data = attendanceTab === 'students' 
      ? students.filter(s => s.class === selectedAttendanceClass && s.academicYear === selectedYear).map(student => {
          const record = attendance.find(a => a.studentId === student.id && a.date === selectedAttendanceDate);
          return {
            'Date': selectedAttendanceDate,
            'Classe': student.class,
            'Élève': student.name,
            'Statut': record?.status || 'present'
          };
        })
      : appUsers.filter(u => u.role === 'teacher').map(teacher => {
          const record = teacherAttendance.find(a => a.teacherId === teacher.id && a.date === selectedAttendanceDate);
          return {
            'Date': selectedAttendanceDate,
            'Enseignant': teacher.name || teacher.email,
            'Statut': record?.status || 'present'
          };
        });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Présences");
    
    XLSX.writeFile(workbook, `presences_${attendanceTab}_${selectedAttendanceDate.replace(/\//g, '-')}.xlsx`);
  };

  const exportFinancesToExcel = (filteredExpenses: Expense[]) => {
    const data = filteredExpenses.map(e => {
      const teacher = appUsers.find(u => u.id === e.teacherId);
      return {
        'Date': e.date,
        'Type': e.type,
        'Description': e.description,
        'Montant': e.amount,
        'Bénéficiaire': teacher?.name || teacher?.email || '-',
        'Mois': e.month || '-',
        'Année Académique': e.academicYear
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Finances");
    
    XLSX.writeFile(workbook, `finances_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportGradesToExcel = () => {
    if (!selectedGradeClass || !selectedGradeSubject) return;

    const subject = config.subjects?.find(s => s.id === selectedGradeSubject);
    const trimesterLabel = selectedGradeTrimester === 4 ? 'Annuel' : `T${selectedGradeTrimester}`;

    const filteredStudentsForGrades = students.filter(s => 
      s.academicYear === selectedYear && 
      (selectedGradeClass === '' 
        ? (isAdmin || isStaff || (isTeacher && currentUserData?.assignedClasses?.includes(s.class))) 
        : s.class === selectedGradeClass)
    );

    const data = filteredStudentsForGrades.map(student => {
      const grade = grades.find(g => 
        g.studentId === student.id && 
        g.subjectId === selectedGradeSubject && 
        g.trimester === selectedGradeTrimester && 
        g.academicYear === selectedYear
      );

      const ecritMoy = grade?.evaluations.ecrit.length 
        ? calculateEcritAverage(grade.evaluations.ecrit, student.class)
        : '-';

      return {
        'Élève': student.name,
        'Moyenne Écrit': typeof ecritMoy === 'number' ? ecritMoy.toFixed(2) : ecritMoy,
        'Oral': grade?.evaluations.oral[0] || '-',
        'Savoir-être': grade?.evaluations.s_etre[0] || '-',
        'TP': grade?.evaluations.tp[0] || '-',
        'Cote': grade?.cote || '-',
        'Observation': grade?.observation || '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Notes");
    
    XLSX.writeFile(workbook, `notes_${selectedGradeClass}_${subject?.name}_${trimesterLabel}_${selectedYear.replace('/', '-')}.xlsx`);
  };

  const exportPaymentsToExcel = (filteredPayments: Payment[]) => {
    const data = filteredPayments.map(p => ({
      'Date': p.date,
      'Élève': p.studentName,
      'Type': p.type,
      'Montant': p.amount,
      'Année Académique': p.academicYear
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Paiements");
    
    XLSX.writeFile(workbook, `paiements_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportStudentsToExcel = () => {
    const data = filteredStudents.map(s => ({
      'Nom': s.name,
      'Classe': s.class,
      'Sexe': s.gender,
      'Statut': s.status,
      'Date de naissance': s.dob || '',
      'Lieu de naissance': s.pob || '',
      'Téléphone': s.phone || '',
      'Email': s.email || '',
      'Frais Inscription': s.regFee,
      'Tranche 1 Versée': s.tranche1,
      'Reste Tranche 1': s.remainingTr1,
      'Tranche 2 Versée': s.tranche2,
      'Reste Tranche 2': s.remainingTr2,
      'Reste Total': s.totalRemaining,
      'Réduction': s.discount,
      'Date Inscription': s.regDate
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Eleves");
    
    // Generate buffer
    XLSX.writeFile(workbook, `eleves_${selectedYear.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

    const handleSaveReportCard = async (card: Partial<ReportCard>) => {
      if (!card.studentId || !card.academicYear || !card.trimester) return;
      
      const cardId = card.id || `${card.studentId}_T${card.trimester}_${card.academicYear}`;
      
      try {
        await setDoc(doc(db, 'report_cards', cardId), {
          ...card,
          id: cardId,
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `report_cards/${cardId}`);
      }
    };

    const ReportCardListModal = ({ isOpen, onClose, className, students, grades, reportCards, trimester, academicYear, onOpenReportCard }: {
      isOpen: boolean,
      onClose: () => void,
      className: string,
      students: Student[],
      grades: Grade[],
      reportCards: ReportCard[],
      trimester: number,
      academicYear: string,
      onOpenReportCard: (student: Student) => void
    }) => {
      if (!isOpen) return null;

      const classStudents = students.filter(s => s.class === className && s.academicYear === academicYear);

      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Bulletins de notes - {className}</h2>
                <p className="text-sm text-slate-500">Trimestre {trimester} - {academicYear}</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {classStudents.map(student => {
                  const hasReportCard = reportCards.some(rc => rc.studentId === student.id && rc.trimester === trimester && rc.academicYear === academicYear);
                  const studentGradesCount = grades.filter(g => g.studentId === student.id && g.trimester === trimester && g.academicYear === academicYear).length;
                  
                  return (
                    <div key={student.id} className="p-4 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                          {student.name.charAt(0)}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${hasReportCard ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {hasReportCard ? 'Prêt' : 'En attente'}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-800 mb-1 truncate">{student.name}</h3>
                      <p className="text-xs text-slate-500 mb-4">{studentGradesCount} matières saisies</p>
                      <button 
                        onClick={() => onOpenReportCard(student)}
                        className="w-full py-2 bg-white border border-slate-200 text-blue-600 text-sm font-bold rounded-xl group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all flex items-center justify-center gap-2"
                      >
                        <Printer className="w-4 h-4" />
                        Voir le bulletin
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      );
    };

    const ReportCardModal = ({ isOpen, onClose, student, trimester, academicYear, grades, reportCards, config, onSave }: {
      isOpen: boolean,
      onClose: () => void,
      student: Student | null,
      trimester: number,
      academicYear: string,
      grades: Grade[],
      reportCards: ReportCard[],
      config: SchoolConfig,
      onSave: (card: any) => Promise<void>
    }) => {
      const reportCardRef = React.useRef<HTMLDivElement>(null);
      const handlePrint = useReactToPrint({
        contentRef: reportCardRef,
      });

      const [formData, setFormData] = useState<any>(null);

      useEffect(() => {
        if (student) {
          const existing = reportCards.find(rc => rc.studentId === student.id && rc.trimester === trimester && rc.academicYear === academicYear);
          setFormData(existing || {
            studentId: student.id,
            academicYear,
            trimester,
            discipline: {
              absences: 0,
              retards: 0,
              retenues: 0,
              blameCond: 0,
              blameTravail: 0,
              avertCond: 0,
              avertTravail: 0,
              exclusion: 0,
            },
            appreciation: '',
            rank: 0,
            classAverage: '',
            decision: ''
          });
        }
      }, [student, trimester, academicYear, reportCards]);

      if (!isOpen || !student || !formData) return null;

      const subjects = config.subjects || [];
      const studentGrades = trimester === 4 
        ? subjects.map(subject => {
            const trimesterGrades = [1, 2, 3].map(t => grades.find(g => 
              g.studentId === student.id && 
              g.subjectId === subject.id && 
              g.trimester === t && 
              g.academicYear === academicYear
            ));
            
            const averages = trimesterGrades.map(g => {
              if (!g) return null;
              const avg = calculateEcritAverage(g.evaluations.ecrit, student.class);
              return avg !== 0 && avg !== '' ? avg : null;
            }).filter(a => a !== null);

            const isMaternelle = ['PS', 'MS', 'GS'].includes(student.class);
            const annualMoy = averages.length > 0 
              ? (isMaternelle 
                  ? averages[averages.length - 1] // Last valid cote for annual
                  : averages.reduce((a: any, b: any) => a + Number(b), 0) / averages.length)
              : null;

            return {
              subjectId: subject.id,
              annualMoy,
              observation: trimesterGrades.map(g => g?.observation).filter(Boolean).join(' | ')
            };
          })
        : grades.filter(g => g.studentId === student.id && g.trimester === trimester && g.academicYear === academicYear);

      const calculateSubjectMoy = (grade: any) => {
        if (trimester === 4) return grade.annualMoy;
        return calculateEcritAverage(grade.evaluations.ecrit, student.class);
      };

      let totalPoints = 0;
      let totalCoefficients = 0;
      const isMaternelle = ['PS', 'MS', 'GS'].includes(student.class);
      
      studentGrades.forEach(g => {
        const subject = subjects.find(s => s.id === g.subjectId);
        const moy = calculateSubjectMoy(g);
        if (moy !== null && moy !== undefined && !isMaternelle) {
          const coef = subject?.coefficient || 1;
          totalPoints += Number(moy) * coef;
          totalCoefficients += coef;
        }
      });

      const generalAverage = !isMaternelle && totalCoefficients > 0 
        ? (totalPoints / totalCoefficients).toFixed(2) 
        : (isMaternelle ? '-' : '0.00');

      return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
          <div className="min-h-full flex items-center justify-center py-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400">
                    <X className="w-6 h-6" />
                  </button>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Bulletin de notes</h2>
                    <p className="text-sm text-slate-500">{student.name} - Trimestre {trimester}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={async () => {
                      await onSave({ ...formData, average: generalAverage });
                      alert("Bulletin enregistré avec succès !");
                    }}
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Enregistrer
                  </button>
                  <button 
                    onClick={() => handlePrint()}
                    className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimer
                  </button>
                </div>
              </div>

              <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Editor Side */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Discipline
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Absences</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.discipline.absences}
                          onChange={(e) => setFormData({ ...formData, discipline: { ...formData.discipline, absences: Number(e.target.value) } })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Retards</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.discipline.retards}
                          onChange={(e) => setFormData({ ...formData, discipline: { ...formData.discipline, retards: Number(e.target.value) } })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Avert. Cond.</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.discipline.avertCond}
                          onChange={(e) => setFormData({ ...formData, discipline: { ...formData.discipline, avertCond: Number(e.target.value) } })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Blâme Cond.</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.discipline.blameCond}
                          onChange={(e) => setFormData({ ...formData, discipline: { ...formData.discipline, blameCond: Number(e.target.value) } })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Avert. Travail</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.discipline.avertTravail}
                          onChange={(e) => setFormData({ ...formData, discipline: { ...formData.discipline, avertTravail: Number(e.target.value) } })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Blâme Travail</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.discipline.blameTravail}
                          onChange={(e) => setFormData({ ...formData, discipline: { ...formData.discipline, blameTravail: Number(e.target.value) } })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Appréciation globale</label>
                      <textarea 
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm h-24 resize-none"
                        value={formData.appreciation}
                        onChange={(e) => setFormData({ ...formData, appreciation: e.target.value })}
                        placeholder="Ex: Très bon trimestre, continuez ainsi..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Rang</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.rank}
                          onChange={(e) => setFormData({ ...formData, rank: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Moy. Classe</label>
                        <input 
                          type="text"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={formData.classAverage}
                          onChange={(e) => setFormData({ ...formData, classAverage: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Décision du conseil</label>
                      <select 
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        value={formData.decision}
                        onChange={(e) => setFormData({ ...formData, decision: e.target.value })}
                      >
                        <option value="">Sélectionner une décision</option>
                        <option value="Tableau d'Honneur">Tableau d'Honneur</option>
                        <option value="Encouragements">Encouragements</option>
                        <option value="Félicitations">Félicitations</option>
                        <option value="Avertissement Travail">Avertissement Travail</option>
                        <option value="Blâme Travail">Blâme Travail</option>
                        <option value="Admis">Admis</option>
                        <option value="Redouble">Redouble</option>
                        <option value="Exclu">Exclu</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Preview Side */}
                <div className="lg:col-span-2">
                  <div ref={reportCardRef} className="bg-white border border-slate-200 p-8 shadow-sm min-h-[1000px] text-slate-900 font-serif">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8 border-b-2 border-slate-900 pb-4">
                      <div className="text-center text-[10px] uppercase font-bold leading-tight">
                        REPUBLIQUE DU CAMEROUN<br/>
                        Paix - Travail - Patrie<br/>
                        MINISTERE DE L'EDUCATION DE BASE<br/>
                        DELEGATION REGIONALE DE L'ADAMAOUA
                      </div>
                      <div className="text-center">
                        {config.schoolLogo ? (
                          <img src={config.schoolLogo} alt="Logo" className="w-16 h-16 mx-auto mb-2" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <GraduationCap className="w-8 h-8 text-slate-400" />
                          </div>
                        )}
                        <h1 className="text-lg font-black uppercase">{config.schoolName || 'GSBCK GESTION'}</h1>
                        <p className="text-[10px] italic">{config.schoolAddress}</p>
                      </div>
                      <div className="text-center text-[10px] uppercase font-bold leading-tight">
                        REPUBLIC OF CAMEROON<br/>
                        Peace - Work - Fatherland<br/>
                        MINISTRY OF BASIC EDUCATION<br/>
                        ADAMAOUA REGIONAL DELEGATION
                      </div>
                    </div>

                    <div className="text-center mb-6">
                      <h2 className="text-xl font-black border-2 border-slate-900 inline-block px-6 py-1 uppercase">
                        {trimester === 4 ? 'BULLETIN DE NOTES ANNUEL' : `BULLETIN DE NOTES DU ${trimester === 1 ? '1er' : trimester === 2 ? '2ème' : '3ème'} TRIMESTRE`}
                      </h2>
                      <p className="font-bold mt-2">ANNEE SCOLAIRE : {academicYear}</p>
                    </div>

                    {/* Student Info */}
                    <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
                      <div className="space-y-1">
                        <p><span className="font-bold">Nom et Prénoms :</span> {student.name}</p>
                        <p><span className="font-bold">Né(e) le :</span> {student.dob || 'N/A'} à {student.pob || 'N/A'}</p>
                        <p><span className="font-bold">Sexe :</span> {student.gender === 'G' ? 'Masculin' : 'Féminin'}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p><span className="font-bold">Classe :</span> {student.class}</p>
                        <p><span className="font-bold">Effectif :</span> {students.filter(s => s.class === student.class && s.academicYear === academicYear).length}</p>
                        <p><span className="font-bold">Statut :</span> {student.status === 'A' ? 'Ancien' : 'Nouveau'}</p>
                      </div>
                    </div>

                    {/* Grades Table */}
                    <table className="w-full border-collapse border-2 border-slate-900 text-[10px] mb-6">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-900 p-1 text-left">DOMAINES / MATIERES</th>
                          <th className="border border-slate-900 p-1 text-center w-12">NOTE /20</th>
                          <th className="border border-slate-900 p-1 text-center w-10">COEF</th>
                          <th className="border border-slate-900 p-1 text-center w-12">TOTAL</th>
                          <th className="border border-slate-900 p-1 text-center">APPRECIATION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(new Set(subjects.map(s => s.group))).map(groupName => {
                          const groupSubjects = subjects.filter(s => s.group === groupName);
                          let groupTotalNote = 0;
                          let groupTotalCoef = 0;
                          let groupHasGrades = false;

                          return (
                            <React.Fragment key={groupName}>
                              <tr className="bg-slate-50">
                                <td colSpan={5} className="border border-slate-900 p-1 font-black uppercase bg-slate-200">
                                  {groupName}
                                </td>
                              </tr>
                              {groupSubjects.map(subject => {
                                const grade = studentGrades.find(g => g.subjectId === subject.id);
                                const moy = trimester === 4 ? (grade as any)?.annualMoy : (grade ? calculateSubjectMoy(grade) : null);
                                const coef = subject.coefficient || 1;
                                const total = (moy !== null && !isMaternelle) ? (Number(moy) * coef) : null;
                                
                                if (moy !== null && !isMaternelle) {
                                  groupTotalNote += total!;
                                  groupTotalCoef += coef;
                                  groupHasGrades = true;
                                }

                                return (
                                  <tr key={subject.id}>
                                    <td className="border border-slate-900 p-1 pl-4 font-medium">{subject.name}</td>
                                    <td className="border border-slate-900 p-1 text-center">
                                      {moy !== null ? (typeof moy === 'number' ? moy.toFixed(2) : moy) : '-'}
                                    </td>
                                    <td className="border border-slate-900 p-1 text-center">{coef}</td>
                                    <td className="border border-slate-900 p-1 text-center">
                                      {total !== null ? total.toFixed(2) : '-'}
                                    </td>
                                    <td className="border border-slate-900 p-1 text-center italic text-[9px]">{(grade as any)?.observation || '-'}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-slate-50 font-bold italic">
                                <td className="border border-slate-900 p-1 text-right">Sous-total {groupName}</td>
                                <td className="border border-slate-900 p-1 text-center">
                                  {groupHasGrades ? (groupTotalNote / groupTotalCoef).toFixed(2) : '-'}
                                </td>
                                <td className="border border-slate-900 p-1 text-center">{groupTotalCoef}</td>
                                <td className="border border-slate-900 p-1 text-center">{groupHasGrades ? groupTotalNote.toFixed(2) : '-'}</td>
                                <td className="border border-slate-900 p-1"></td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-200 font-black text-xs">
                          <td className="border border-slate-900 p-2 text-right">TOTAL GENERAL</td>
                          <td colSpan={2} className="border border-slate-900 p-2 text-center bg-yellow-50">MOYENNE : {generalAverage} / 20</td>
                          <td className="border border-slate-900 p-2 text-center">{totalPoints.toFixed(2)}</td>
                          <td className="border border-slate-900 p-2 text-center">
                            RANG : {formData.rank || '-'} / {students.filter(s => s.class === student.class && s.academicYear === academicYear).length}
                          </td>
                        </tr>
                      </tfoot>
                    </table>

                    {/* Bilan des Domaines */}
                    <div className="mb-6">
                      <h3 className="text-xs font-black uppercase mb-2 border-b-2 border-slate-900 pb-1">BILAN DES DOMAINES</h3>
                      <table className="w-full border-collapse border-2 border-slate-900 text-[9px]">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="border border-slate-900 p-1 text-left">DOMAINES</th>
                            <th className="border border-slate-900 p-1 text-center">MOYENNE / 20</th>
                            <th className="border border-slate-900 p-1 text-center">APPRECIATION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(new Set(subjects.map(s => s.group))).map(groupName => {
                            const groupSubjects = subjects.filter(s => s.group === groupName);
                            let groupTotalNote = 0;
                            let groupTotalCoef = 0;
                            let groupHasGrades = false;

                            groupSubjects.forEach(subject => {
                              const grade = studentGrades.find(g => g.subjectId === subject.id);
                              const moy = trimester === 4 ? (grade as any)?.annualMoy : (grade ? calculateSubjectMoy(grade) : null);
                              const coef = subject.coefficient || 1;
                              if (moy !== null) {
                                groupTotalNote += moy * coef;
                                groupTotalCoef += coef;
                                groupHasGrades = true;
                              }
                            });

                            const groupMoy = groupHasGrades ? (groupTotalNote / groupTotalCoef) : null;
                            const appreciation = isMaternelle ? (groupHasGrades ? 'Acquis' : '-') : (groupMoy === null ? '-' :
                              groupMoy >= 18 ? 'Excellent' :
                              groupMoy >= 16 ? 'Très Bien' :
                              groupMoy >= 14 ? 'Bien' :
                              groupMoy >= 12 ? 'Assez Bien' :
                              groupMoy >= 10 ? 'Passable' : 'Insuffisant');

                            return (
                              <tr key={groupName}>
                                <td className="border border-slate-900 p-1 font-bold">{groupName}</td>
                                <td className="border border-slate-900 p-1 text-center font-black">
                                  {isMaternelle ? (groupHasGrades ? 'Validé' : '-') : (groupMoy !== null ? groupMoy.toFixed(2) : '-')}
                                </td>
                                <td className="border border-slate-900 p-1 text-center italic">{appreciation}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Discipline & Results */}
                    <div className="grid grid-cols-2 gap-8 mb-8 text-xs">
                      <div className="border-2 border-slate-900 p-4 rounded-xl">
                        <h3 className="font-black uppercase mb-2 border-b border-slate-900 pb-1">CONDUITE ET DISCIPLINE</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <p>Absences : <span className="font-bold">{formData.discipline.absences}</span></p>
                          <p>Retards : <span className="font-bold">{formData.discipline.retards}</span></p>
                          <p>Avert. Travail : <span className="font-bold">{formData.discipline.avertTravail}</span></p>
                          <p>Blâme Travail : <span className="font-bold">{formData.discipline.blameTravail}</span></p>
                        </div>
                      </div>
                      <div className="border-2 border-slate-900 p-4 rounded-xl">
                        <h3 className="font-black uppercase mb-2 border-b border-slate-900 pb-1">
                          {trimester === 4 ? 'RESULTATS DE L\'ANNEE' : 'RESULTATS DU TRIMESTRE'}
                        </h3>
                        <p className="mb-2">
                          <span className="font-bold">{trimester === 4 ? 'Moyenne Annuelle' : 'Moyenne du Trimestre'} :</span> {generalAverage} / 20
                        </p>
                        <p className="mb-2"><span className="font-bold">Décision :</span> {formData.decision || 'N/A'}</p>
                        <p><span className="font-bold">Appréciation :</span> {formData.appreciation || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Signatures */}
                    <div className="grid grid-cols-3 gap-4 text-center text-[10px] font-bold mt-12">
                      <div>
                        <p className="uppercase underline mb-12">L'Enseignant</p>
                        <p className="italic text-slate-400">(Signature)</p>
                      </div>
                      <div>
                        <p className="uppercase underline mb-12">Le Parent</p>
                        <p className="italic text-slate-400">(Signature)</p>
                      </div>
                      <div>
                        <p className="uppercase underline mb-12">Le Directeur</p>
                        <p className="italic text-slate-400">(Signature & Cachet)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      );
    };

  const handleConnectGoogle = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_oauth', 'width=600,height=700');
    } catch (error) {
      console.error('Erreur connexion Google:', error);
      alert('Impossible de se connecter à Google.');
    }
  };

  const handleCreateSpreadsheet = async () => {
    if (!isGoogleConnected) {
      alert('Veuillez d\'abord vous connecter avec Google.');
      return;
    }

    setIsCreatingSpreadsheet(true);
    try {
      const response = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Suivi Scolaire - ${config.schoolName || 'Gestion'}` })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création du fichier');
      }

      const { spreadsheetId } = await response.json();
      await handleUpdateConfig({ ...config, spreadsheetId });
      
      setNotifications(prev => [...prev, {
        id: Date.now().toString(),
        type: 'success',
        message: 'Fichier Google Sheets créé et configuré avec succès !',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } catch (error) {
      console.error('Erreur création Google Sheets:', error);
      alert('Impossible de créer le fichier Google Sheets.');
    } finally {
      setIsCreatingSpreadsheet(false);
    }
  };

  const syncToGoogleSheets = async (type: 'student' | 'payment', data: any) => {
    if (!config.spreadsheetId) return;

    try {
      let values: any[] = [];
      let range = '';

      if (type === 'student') {
        range = 'Eleves!A:G';
        values = [
          data.id || '',
          data.name || '',
          data.class || '',
          data.gender || '',
          data.phone || '',
          data.regDate || '',
          new Date().toLocaleString()
        ];
      } else if (type === 'payment') {
        range = 'Paiements!A:G';
        values = [
          data.id || '',
          data.studentName || '',
          data.amount || 0,
          data.type || '',
          data.date || '',
          data.academicYear || '',
          new Date().toLocaleString()
        ];
      }

      const response = await fetch('/api/sheets/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: config.spreadsheetId,
          range,
          values
        })
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 401) {
          setIsGoogleConnected(false);
          console.warn('Google Sheets: Session expirée');
        }
        throw new Error(error.error || 'Erreur de synchronisation');
      }

      console.log(`Synchronisation Google Sheets (${type}) réussie`);
    } catch (error) {
      console.error('Erreur synchronisation Google Sheets:', error);
    }
  };

  const handleAddStudent = async (newStudent: Omit<Student, 'id' | 'remainingTr1' | 'remainingTr2' | 'totalRemaining'>) => {
    if (!config.currentAcademicYear) {
      alert("L'année académique n'est pas configurée. Veuillez la configurer dans les paramètres.");
      return;
    }
    
    if (isSubmitting) return;

    // Check for duplicates
    const isDuplicate = students.some(s => 
      s.name.toLowerCase() === newStudent.name.toLowerCase() && 
      s.academicYear === config.currentAcademicYear
    );

    if (isDuplicate) {
      setConfirmAction({
        title: "Doublon potentiel",
        message: `Un élève nommé "${newStudent.name}" est déjà inscrit pour l'année ${config.currentAcademicYear}. Voulez-vous continuer ?`,
        onConfirm: () => proceedWithAddStudent(newStudent)
      });
      setIsConfirmModalOpen(true);
      return;
    }

    await proceedWithAddStudent(newStudent);
  };

  const proceedWithAddStudent = async (newStudent: Omit<Student, 'id' | 'remainingTr1' | 'remainingTr2' | 'totalRemaining'>) => {
    setIsSubmitting(true);
    const studentId = Math.random().toString(36).substr(2, 9);
    
    const { expectedTr1, expectedTr2 } = calculateExpectedTranches(newStudent.class, config, newStudent.discount);

    const remainingTr1 = Math.max(0, expectedTr1 - newStudent.tranche1);
    const remainingTr2 = Math.max(0, expectedTr2 - newStudent.tranche2);

    if (newStudent.regFee > config.registrationFee) {
      alert(`Les frais d'inscription ne peuvent pas dépasser ${config.registrationFee.toLocaleString()} FCFA`);
      setIsSubmitting(false);
      return;
    }
    if (newStudent.tranche1 > expectedTr1) {
      alert(`La tranche 1 ne peut pas dépasser ${expectedTr1.toLocaleString()} FCFA (après réduction)`);
      setIsSubmitting(false);
      return;
    }
    if (newStudent.tranche2 > expectedTr2) {
      alert(`La tranche 2 ne peut pas dépasser ${expectedTr2.toLocaleString()} FCFA (après réduction)`);
      setIsSubmitting(false);
      return;
    }

    const student: Student = {
      ...newStudent,
      id: studentId,
      remainingTr1,
      remainingTr2,
      totalRemaining: remainingTr1 + remainingTr2,
      academicYear: config.currentAcademicYear
    };

    try {
      const batch = writeBatch(db);
      
      // Add student
      batch.set(doc(db, 'students', studentId), student);

      // Create payment records for initial amounts
      const today = new Date().toLocaleDateString('fr-FR');
      
      if (newStudent.regFee > 0) {
        const pId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'payments', pId), {
          id: pId,
          studentId,
          studentName: newStudent.name,
          amount: newStudent.regFee,
          date: today,
          type: 'inscription',
          academicYear: config.currentAcademicYear
        });
      }
      if (newStudent.tranche1 > 0) {
        const pId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'payments', pId), {
          id: pId,
          studentId,
          studentName: newStudent.name,
          amount: newStudent.tranche1,
          date: today,
          type: 'tranche1',
          academicYear: config.currentAcademicYear
        });
      }
      if (newStudent.tranche2 > 0) {
        const pId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'payments', pId), {
          id: pId,
          studentId,
          studentName: newStudent.name,
          amount: newStudent.tranche2,
          date: today,
          type: 'tranche2',
          academicYear: config.currentAcademicYear
        });
      }

      await batch.commit();
      
      // Sync to Google Sheets
      syncToGoogleSheets('student', { id: studentId, ...newStudent });
      if (newStudent.regFee > 0) syncToGoogleSheets('payment', { id: 'reg_' + studentId, studentName: newStudent.name, amount: newStudent.regFee, type: 'inscription', date: today, academicYear: config.currentAcademicYear });
      if (newStudent.tranche1 > 0) syncToGoogleSheets('payment', { id: 'tr1_' + studentId, studentName: newStudent.name, amount: newStudent.tranche1, type: 'tranche1', date: today, academicYear: config.currentAcademicYear });
      if (newStudent.tranche2 > 0) syncToGoogleSheets('payment', { id: 'tr2_' + studentId, studentName: newStudent.name, amount: newStudent.tranche2, type: 'tranche2', date: today, academicYear: config.currentAcademicYear });

      setIsModalOpen(false);
      setIsConfirmModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `students/${studentId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStudent = async (studentId: string, updatedData: Omit<Student, 'id' | 'remainingTr1' | 'remainingTr2' | 'totalRemaining' | 'academicYear'>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const { expectedTr1, expectedTr2 } = calculateExpectedTranches(updatedData.class, config, updatedData.discount);

    const remainingTr1 = Math.max(0, expectedTr1 - updatedData.tranche1);
    const remainingTr2 = Math.max(0, expectedTr2 - updatedData.tranche2);

    if (updatedData.regFee > config.registrationFee) {
      alert(`Les frais d'inscription ne peuvent pas dépasser ${config.registrationFee.toLocaleString()} FCFA`);
      setIsSubmitting(false);
      return;
    }
    if (updatedData.tranche1 > expectedTr1) {
      alert(`La tranche 1 ne peut pas dépasser ${expectedTr1.toLocaleString()} FCFA (après réduction)`);
      setIsSubmitting(false);
      return;
    }
    if (updatedData.tranche2 > expectedTr2) {
      alert(`La tranche 2 ne peut pas dépasser ${expectedTr2.toLocaleString()} FCFA (après réduction)`);
      setIsSubmitting(false);
      return;
    }

    try {
      await setDoc(doc(db, 'students', studentId), {
        ...updatedData,
        remainingTr1,
        remainingTr2,
        totalRemaining: remainingTr1 + remainingTr2
      }, { merge: true });

      setIsModalOpen(false);
      setEditingStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `students/${studentId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPayment = async (paymentData: { amount: number, type: 'inscription' | 'tranche1' | 'tranche2', date: string }) => {
    if (!canWrite) {
      alert("Vous n'avez pas les droits pour enregistrer des paiements.");
      return;
    }
    if (!selectedStudentForPayment) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    const pId = Math.random().toString(36).substr(2, 9);
    const payment: Payment = {
      id: pId,
      studentId: selectedStudentForPayment.id,
      studentName: selectedStudentForPayment.name,
      amount: paymentData.amount,
      date: paymentData.date,
      type: paymentData.type,
      academicYear: config.currentAcademicYear
    };

    // Calculate new student totals
    let newRegFee = selectedStudentForPayment.regFee;
    let newTranche1 = selectedStudentForPayment.tranche1;
    let newTranche2 = selectedStudentForPayment.tranche2;

    if (payment.type === 'inscription') newRegFee += payment.amount;
    if (payment.type === 'tranche1') newTranche1 += payment.amount;
    if (payment.type === 'tranche2') newTranche2 += payment.amount;

    const { expectedTr1, expectedTr2 } = calculateExpectedTranches(selectedStudentForPayment.class, config, selectedStudentForPayment.discount);

    if (paymentData.type === 'inscription' && paymentData.amount > (config.registrationFee - selectedStudentForPayment.regFee)) {
      alert(`Le montant ne peut pas dépasser le reste à payer pour l'inscription (${(config.registrationFee - selectedStudentForPayment.regFee).toLocaleString()} FCFA)`);
      setIsSubmitting(false);
      return;
    }
    if (paymentData.type === 'tranche1' && paymentData.amount > selectedStudentForPayment.remainingTr1) {
      alert(`Le montant ne peut pas dépasser le reste à payer pour la tranche 1 (${selectedStudentForPayment.remainingTr1.toLocaleString()} FCFA)`);
      setIsSubmitting(false);
      return;
    }
    if (paymentData.type === 'tranche2' && paymentData.amount > selectedStudentForPayment.remainingTr2) {
      alert(`Le montant ne peut pas dépasser le reste à payer pour la tranche 2 (${selectedStudentForPayment.remainingTr2.toLocaleString()} FCFA)`);
      setIsSubmitting(false);
      return;
    }

    const remainingTr1 = Math.max(0, expectedTr1 - newTranche1);
    const remainingTr2 = Math.max(0, expectedTr2 - newTranche2);

    try {
      // Add payment record
      await setDoc(doc(db, 'payments', pId), payment);
      
      // Update student record
      await setDoc(doc(db, 'students', selectedStudentForPayment.id), {
        regFee: newRegFee,
        tranche1: newTranche1,
        tranche2: newTranche2,
        remainingTr1,
        remainingTr2,
        totalRemaining: remainingTr1 + remainingTr2
      }, { merge: true });

      // Sync to Google Sheets
      syncToGoogleSheets('payment', payment);

      setIsPaymentModalOpen(false);
      setSelectedPaymentForReceipt(payment);
      setIsReceiptModalOpen(true);
      
      // Schedule WhatsApp confirmation after 5 minutes
      if (selectedStudentForPayment.phone) {
        const studentName = selectedStudentForPayment.name;
        setTimeout(() => {
          addNotification(
            "Reçu WhatsApp Prêt",
            `Le reçu WhatsApp pour ${studentName} est prêt à être envoyé (5 min après le paiement).`,
            'info',
            () => handleSendPaymentWhatsApp(payment)
          );
        }, 5 * 60 * 1000);
      }
      
      setSelectedStudentForPayment(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `payments/${pId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExpense = async (newExpense: Omit<Expense, 'id'>) => {
    if (!config.currentAcademicYear) {
      alert("L'année académique n'est pas configurée. Veuillez la configurer dans les paramètres.");
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    const expenseId = Math.random().toString(36).substr(2, 9);
    const expense: Expense = {
      ...newExpense,
      id: expenseId,
      academicYear: selectedYear
    };
    try {
      await setDoc(doc(db, 'expenses', expenseId), expense);
      setIsExpenseModalOpen(false);
      setEditingExpense(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `expenses/${expenseId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExpense = async (expenseId: string, updatedData: Omit<Expense, 'id' | 'academicYear'>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const expenseToUpdate = expenses.find(e => e.id === expenseId);
      const yearToSave = expenseToUpdate?.academicYear || selectedYear;

      await setDoc(doc(db, 'expenses', expenseId), {
        ...updatedData,
        academicYear: yearToSave
      }, { merge: true });
      setIsExpenseModalOpen(false);
      setEditingExpense(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `expenses/${expenseId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    setConfirmAction({
      title: "Supprimer l'élève",
      message: "Êtes-vous sûr de vouloir supprimer cet élève ? Cette action est irréversible et supprimera également tous ses paiements.",
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'students', id));
          
          // Also delete associated payments
          const paymentsToDelete = payments.filter(p => p.studentId === id);
          paymentsToDelete.forEach(p => {
            batch.delete(doc(db, 'payments', p.id));
          });

          await batch.commit();
          setIsConfirmModalOpen(false);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const handleExportCSV = (data: Expense[], filename: string) => {
    if (data.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const headers = ["Date", "Description", "Catégorie", "Montant (FCFA)", "Bénéficiaire/Enseignant"];
    const csvRows = [
      headers.join(","),
      ...data.map(expense => {
        const date = new Date(expense.date).toLocaleDateString();
        const description = `"${expense.description.replace(/"/g, '""')}"`;
        const category = expense.type === 'salaire' ? 'Salaire' : 'Dépense';
        const amount = expense.amount;
        let beneficiary = "";
        if (expense.type === 'salaire' && expense.teacherId) {
          const teacher = appUsers.find(u => u.id === expense.teacherId);
          beneficiary = teacher ? `"${teacher.name.replace(/"/g, '""')}"` : "";
        }
        return [date, description, category, amount, beneficiary].join(",");
      })
    ];

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${selectedYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteExpense = async (id: string) => {
    setConfirmAction({
      title: "Supprimer la dépense",
      message: "Êtes-vous sûr de vouloir supprimer cette dépense ?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'expenses', id));
          setIsConfirmModalOpen(false);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `expenses/${id}`);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const generateReceipt = (payment: Payment) => {
    const doc = new jsPDF();
    const student = students.find(s => s.id === payment.studentId);
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text("REÇU DE PAIEMENT", 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Date d'émission: ${new Date().toLocaleDateString('fr-FR')}`, 105, 28, { align: 'center' });
    
    // School Info
    if (config.schoolLogo) {
      try {
        doc.addImage(config.schoolLogo, 'PNG', 20, 35, 20, 20);
      } catch (e) {
        console.error("Error adding logo to PDF:", e);
      }
    }
    
    const textStartX = config.schoolLogo ? 45 : 20;
    
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(config.schoolName || "ÉCOLE BILINGUE LES PETITS GÉNIES", textStartX, 45);
    doc.setFontSize(10);
    doc.text(config.schoolAddress || "Ngaoundéré, Cameroun", textStartX, 52);
    doc.text(`Contact: ${config.schoolPhone || "+237 6XX XX XX XX"}`, textStartX, 59);
    if (config.schoolEmail) {
      doc.text(`Email: ${config.schoolEmail}`, textStartX, 66);
    }
    
    // Receipt Details
    const lineY = config.schoolEmail ? 72 : 65;
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(20, lineY, 190, lineY);
    
    doc.setFontSize(11);
    doc.text(`N° Reçu: ${payment.id.substring(0, 8).toUpperCase()}`, 20, lineY + 10);
    doc.text(`Année Scolaire: ${payment.academicYear}`, 190, lineY + 10, { align: 'right' });
    
    // Table for Payment Info
    autoTable(doc, {
      startY: lineY + 20,
      head: [['Désignation', 'Détails']],
      body: [
        ['Élève', payment.studentName],
        ['Classe', student ? student.class : 'N/A'],
        ['Type de Paiement', payment.type.charAt(0).toUpperCase() + payment.type.slice(1)],
        ['Date du Paiement', payment.date],
        ['Montant Versé', `${payment.amount.toLocaleString()} FCFA`],
        ['Reste à Payer', student ? `${(payment.type === 'inscription' ? 0 : payment.type === 'tranche1' ? student.remainingTr1 : student.remainingTr2).toLocaleString()} FCFA` : 'N/A'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      styles: { fontSize: 10, cellPadding: 5 },
    });
    
    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.text("Signature & Cachet", 150, finalY + 10, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Merci pour votre confiance.", 105, 280, { align: 'center' });
    
    doc.save(`Recu_${payment.studentName.replace(/\s+/g, '_')}_${payment.date.replace(/\//g, '-')}.pdf`);
  };

  const handleSendPaymentWhatsApp = (payment: Payment) => {
    const student = students.find(s => s.id === payment.studentId);
    if (!student || !student.phone) {
      alert("Impossible de trouver les coordonnées de l'élève.");
      return;
    }

    const template = config.paymentConfirmationTemplate || "Reçu de paiement pour [NOM_ELEVE]. Montant versé: [MONTANT_PAYE] FCFA. Reste à payer: Tranche 1: [RESTE_T1] FCFA (Echéance: [ECHEANCE_T1]), Tranche 2: [RESTE_T2] FCFA (Echéance: [ECHEANCE_T2]), Total: [TOTAL_RESTANT] FCFA. Merci!";
    
    const deadline1 = student.tranche1Deadline || config.tranche1Deadline || 'Non définie';
    const deadline2 = student.tranche2Deadline || config.tranche2Deadline || 'Non définie';

    const message = template
      .replace(/\[NOM_ELEVE\]/g, student.name)
      .replace(/\[MONTANT_PAYE\]/g, payment.amount.toLocaleString())
      .replace(/\[RESTE_T1\]/g, student.remainingTr1.toLocaleString())
      .replace(/\[ECHEANCE_T1\]/g, deadline1)
      .replace(/\[RESTE_T2\]/g, student.remainingTr2.toLocaleString())
      .replace(/\[ECHEANCE_T2\]/g, deadline2)
      .replace(/\[TOTAL_RESTANT\]/g, student.totalRemaining.toLocaleString());

    sendWhatsAppMessage(student.phone, message);
  };

  const handleSendPaymentSMS = (payment: Payment) => {
    const student = students.find(s => s.id === payment.studentId);
    if (!student || !student.phone) {
      alert("Impossible de trouver les coordonnées de l'élève.");
      return;
    }

    const template = config.paymentConfirmationTemplate || "Reçu de paiement pour [NOM_ELEVE]. Montant versé: [MONTANT_PAYE] FCFA. Reste à payer: Tranche 1: [RESTE_T1] FCFA (Echéance: [ECHEANCE_T1]), Tranche 2: [RESTE_T2] FCFA (Echéance: [ECHEANCE_T2]), Total: [TOTAL_RESTANT] FCFA. Merci!";
    
    const deadline1 = student.tranche1Deadline || config.tranche1Deadline || 'Non définie';
    const deadline2 = student.tranche2Deadline || config.tranche2Deadline || 'Non définie';

    const message = template
      .replace(/\[NOM_ELEVE\]/g, student.name)
      .replace(/\[MONTANT_PAYE\]/g, payment.amount.toLocaleString())
      .replace(/\[RESTE_T1\]/g, student.remainingTr1.toLocaleString())
      .replace(/\[ECHEANCE_T1\]/g, deadline1)
      .replace(/\[RESTE_T2\]/g, student.remainingTr2.toLocaleString())
      .replace(/\[ECHEANCE_T2\]/g, deadline2)
      .replace(/\[TOTAL_RESTANT\]/g, student.totalRemaining.toLocaleString());

    sendSMSMessage(student.phone, message);
  };

  const handleSendReminderWhatsApp = (student: Student, type: 'tranche1' | 'tranche2', isOverdue: boolean = false) => {
    if (!student.phone) {
      alert("Aucun numéro de téléphone n'est configuré pour cet élève.");
      return;
    }

    const amount = type === 'tranche1' ? student.remainingTr1 : student.remainingTr2;
    const deadline = type === 'tranche1' ? config.tranche1Deadline : config.tranche2Deadline;
    const typeLabel = type === 'tranche1' ? 'Tranche 1' : 'Tranche 2';

    const header = isOverdue ? "AVIS DE RETARD DE PAIEMENT" : "RAPPEL DE PAIEMENT";
    const body = isOverdue 
      ? `La date limite (${deadline}) est dépassée pour le paiement de la ${typeLabel} de votre enfant ${student.name} (${student.class}).`
      : `Ceci est un rappel concernant le paiement de la ${typeLabel} pour votre enfant ${student.name} (${student.class}).`;

    const message = `${header}\n\nBonjour,\n\n${body}\n\nMontant restant : ${amount.toLocaleString()} FCFA\n\nMerci de régulariser la situation dès que possible.\n\n${config.schoolName || "GSBCK GESTION"}`;

    sendWhatsAppMessage(student.phone, message);
  };

  const handleSendReminderSMS = (student: Student, type: 'tranche1' | 'tranche2', isOverdue: boolean = false) => {
    if (!student.phone) {
      alert("Aucun numéro de téléphone n'est configuré pour cet élève.");
      return;
    }

    const amount = type === 'tranche1' ? student.remainingTr1 : student.remainingTr2;
    const deadline = type === 'tranche1' ? config.tranche1Deadline : config.tranche2Deadline;
    const typeLabel = type === 'tranche1' ? 'Tranche 1' : 'Tranche 2';

    const header = isOverdue ? "AVIS DE RETARD DE PAIEMENT" : "RAPPEL DE PAIEMENT";
    const body = isOverdue 
      ? `La date limite (${deadline}) est dépassée pour le paiement de la ${typeLabel} de votre enfant ${student.name} (${student.class}).`
      : `Ceci est un rappel concernant le paiement de la ${typeLabel} pour votre enfant ${student.name} (${student.class}).`;

    const message = `${header}\n\nBonjour,\n\n${body}\n\nMontant restant : ${amount.toLocaleString()} FCFA\n\nMerci de régulariser la situation dès que possible.\n\n${config.schoolName || "GSBCK GESTION"}`;

    sendSMSMessage(student.phone, message);
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!isAdmin) {
      alert("Seul l'administrateur peut supprimer des paiements.");
      return;
    }
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    setConfirmAction({
      title: "Supprimer le paiement",
      message: `Êtes-vous sûr de vouloir supprimer ce paiement de ${payment.amount.toLocaleString()} FCFA pour ${payment.studentName} ?`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'payments', paymentId));

          const student = students.find(s => s.id === payment.studentId);
          if (student) {
            const studentRef = doc(db, 'students', student.id);
            const updateData: any = {};
            if (payment.type === 'inscription') {
              updateData.regFee = Math.max(0, student.regFee - payment.amount);
            } else if (payment.type === 'tranche1') {
              updateData.tranche1 = Math.max(0, student.tranche1 - payment.amount);
              updateData.remainingTr1 = student.remainingTr1 + payment.amount;
            } else if (payment.type === 'tranche2') {
              updateData.tranche2 = Math.max(0, student.tranche2 - payment.amount);
              updateData.remainingTr2 = student.remainingTr2 + payment.amount;
            }
            updateData.totalRemaining = student.totalRemaining + (payment.type === 'inscription' ? 0 : payment.amount);
            batch.update(studentRef, updateData);
          }

          await batch.commit();
          setIsConfirmModalOpen(false);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `payments/${paymentId}`);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const handleImportExcel = async (parsedData: any[]) => {
    const batch = writeBatch(db);
    const today = new Date().toLocaleDateString('fr-FR');
    let importedCount = 0;
    
    for (const row of parsedData) {
      if (!row[0] || !row[1]) continue;

      const name = row[0].trim();
      const studentClass = row[1].trim();
      const dob = row[2]?.trim() || '';
      const pob = row[3]?.trim() || '';
      const gender = row[4]?.trim() || 'M';
      const phone = row[5]?.trim() || '';
      const status = row[6]?.trim() || 'N';
      const regDate = row[7]?.trim() || today;
      const regFee = parseInt(row[8]?.toString().replace(/\s/g, '')) || 0;
      const tranche1 = parseInt(row[9]?.toString().replace(/\s/g, '')) || 0;
      const tranche2 = parseInt(row[10]?.toString().replace(/\s/g, '')) || 0;

      const studentId = Math.random().toString(36).substr(2, 9);
      const { expectedTr1, expectedTr2 } = calculateExpectedTranches(studentClass, config, 0);
      
      const remainingTr1 = Math.max(0, expectedTr1 - tranche1);
      const remainingTr2 = Math.max(0, expectedTr2 - tranche2);

      const student: Student = {
        id: studentId,
        name,
        class: studentClass,
        dob,
        pob,
        gender,
        phone,
        status,
        regDate,
        regFee,
        tranche1,
        tranche2,
        remainingTr1,
        remainingTr2,
        totalRemaining: remainingTr1 + remainingTr2,
        academicYear: config.currentAcademicYear
      };

      batch.set(doc(db, 'students', studentId), student);

      if (regFee > 0) {
        const pId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'payments', pId), {
          id: pId,
          studentId,
          studentName: name,
          amount: regFee,
          date: regDate,
          type: 'inscription',
          academicYear: config.currentAcademicYear
        });
      }
      if (tranche1 > 0) {
        const pId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'payments', pId), {
          id: pId,
          studentId,
          studentName: name,
          amount: tranche1,
          date: regDate,
          type: 'tranche1',
          academicYear: config.currentAcademicYear
        });
      }
      if (tranche2 > 0) {
        const pId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'payments', pId), {
          id: pId,
          studentId,
          studentName: name,
          amount: tranche2,
          date: regDate,
          type: 'tranche2',
          academicYear: config.currentAcademicYear
        });
      }
      importedCount++;
    }

    await batch.commit();
    addNotification('Importation réussie', `${importedCount} élèves ont été importés avec succès.`, 'info');
  };

  const handleExportAllToExcel = async () => {
    try {
      const collections = ['students', 'expenses', 'payments', 'grades', 'attendance', 'teacher_attendance', 'report_cards', 'funding', 'config', 'users'];
      const workbook = XLSX.utils.book_new();

      for (const collName of collections) {
        const snapshot = await getDocs(collection(db, collName));
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (data.length > 0) {
          const worksheet = XLSX.utils.json_to_sheet(data);
          XLSX.utils.book_append_sheet(workbook, worksheet, collName.substring(0, 31)); // Sheet names max 31 chars
        }
      }

      XLSX.writeFile(workbook, `sauvegarde_complete_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      alert("Erreur lors de l'exportation Excel.");
    }
  };

  const handleExportData = async () => {
    try {
      const collections = ['students', 'expenses', 'payments', 'config', 'users'];
      const backupData: any = {};

      for (const collName of collections) {
        const snapshot = await getDocs(collection(db, collName));
        backupData[collName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sauvegarde_ecole_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Erreur lors de l'exportation des données.");
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Attention : Cette opération va écraser ou fusionner les données existantes. Voulez-vous continuer ?")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const collections = ['students', 'expenses', 'payments', 'config', 'users'];

        for (const collName of collections) {
          if (data[collName]) {
            const batch = writeBatch(db);
            for (const item of data[collName]) {
              const { id, ...rest } = item;
              const docRef = doc(db, collName, id);
              batch.set(docRef, rest);
            }
            await batch.commit();
          }
        }
        alert("Restauration terminée avec succès !");
      } catch (error) {
        console.error("Error importing data:", error);
        alert("Erreur lors de l'importation des données. Vérifiez le format du fichier.");
      }
    };
    reader.readAsText(file);
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-border">
        <div className="flex items-center gap-4 mb-4">
          <Search className="w-5 h-5 text-card-foreground/40" />
          <input 
            type="text" 
            placeholder="Recherche rapide d'un élève pour paiement..." 
            className="flex-1 bg-transparent border-none focus:ring-0 text-card-foreground font-medium placeholder:text-card-foreground/30"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value.length > 2) {
                setCurrentView('students');
              }
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Élèves" 
          value={stats.totalStudents} 
          icon={<Users className="w-5 h-5" />} 
          color="bg-primary"
        />
        <StatCard 
          title="Total Encaissé" 
          value={`${stats.totalCollected.toLocaleString()} FCFA`} 
          icon={<TrendingUp className="w-5 h-5" />} 
          color="bg-emerald-500"
        />
        <StatCard 
          title="Total Dépenses" 
          value={`${stats.totalExpenses.toLocaleString()} FCFA`} 
          icon={<TrendingDown className="w-5 h-5" />} 
          color="bg-rose-500"
        />
        <StatCard 
          title="Solde Actuel" 
          value={`${stats.balance.toLocaleString()} FCFA`} 
          icon={<Wallet className="w-5 h-5" />} 
          color="bg-amber-500"
        />
      </div>

      {/* Deadlines Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${isOverdue(config.tranche1Deadline) ? 'bg-rose-50 border-rose-100' : 'bg-card border-border'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isOverdue(config.tranche1Deadline) ? 'bg-rose-100 text-rose-600' : 'bg-primary/10 text-primary'}`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-card-foreground/50 uppercase tracking-wider">Échéance Tranche 1</p>
              <p className={`text-sm font-bold ${isOverdue(config.tranche1Deadline) ? 'text-rose-600' : 'text-card-foreground'}`}>
                {config.tranche1Deadline || 'Non définie'}
                {isOverdue(config.tranche1Deadline) && <span className="ml-2 text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded uppercase">Dépassée</span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-card-foreground">{stats.totalRemainingTr1.toLocaleString()} FCFA</p>
            <p className="text-[10px] text-card-foreground/40 font-bold uppercase">À recouvrer</p>
          </div>
        </div>
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${isOverdue(config.tranche2Deadline) ? 'bg-rose-50 border-rose-100' : 'bg-card border-border'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isOverdue(config.tranche2Deadline) ? 'bg-rose-100 text-rose-600' : 'bg-purple-100 text-purple-600'}`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-card-foreground/50 uppercase tracking-wider">Échéance Tranche 2</p>
              <p className={`text-sm font-bold ${isOverdue(config.tranche2Deadline) ? 'text-rose-600' : 'text-card-foreground'}`}>
                {config.tranche2Deadline || 'Non définie'}
                {isOverdue(config.tranche2Deadline) && <span className="ml-2 text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded uppercase">Dépassée</span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-card-foreground">{stats.totalRemainingTr2.toLocaleString()} FCFA</p>
            <p className="text-[10px] text-card-foreground/40 font-bold uppercase">À recouvrer</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          title="Reste Tranche 1" 
          value={`${stats.totalRemainingTr1.toLocaleString()} FCFA`} 
          icon={<AlertCircle className="w-5 h-5" />} 
          color="bg-orange-500"
          onClick={() => {
            setReminderModalInitialType('overdue');
            setIsReminderModalOpen(true);
          }}
          actionIcon={<Send className="w-3 h-3" />}
        />
        <StatCard 
          title="Reste Tranche 2" 
          value={`${stats.totalRemainingTr2.toLocaleString()} FCFA`} 
          icon={<AlertCircle className="w-5 h-5" />} 
          color="bg-orange-500"
          onClick={() => {
            setReminderModalInitialType('overdue');
            setIsReminderModalOpen(true);
          }}
          actionIcon={<Send className="w-3 h-3" />}
        />
        <StatCard 
          title="Reste Total à Recouvrer" 
          value={`${stats.totalRemaining.toLocaleString()} FCFA`} 
          icon={<AlertCircle className="w-5 h-5" />} 
          color="bg-red-500"
          onClick={() => {
            setReminderModalInitialType('overdue');
            setIsReminderModalOpen(true);
          }}
          actionIcon={<Send className="w-3 h-3" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="p-6 bg-blue-600 text-white rounded-3xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex flex-col items-center gap-3 group"
        >
          <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform">
            <UserPlus className="w-6 h-6" />
          </div>
          <span className="font-bold">Inscrire un élève</span>
        </button>
        <button 
          onClick={() => setIsExpenseModalOpen(true)}
          className="p-6 bg-rose-600 text-white rounded-3xl shadow-lg shadow-rose-500/20 hover:bg-rose-700 transition-all flex flex-col items-center gap-3 group"
        >
          <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform">
            <TrendingDown className="w-6 h-6" />
          </div>
          <span className="font-bold">Nouvelle dépense</span>
        </button>
        <button 
          onClick={() => setCurrentView('students')}
          className="p-6 bg-emerald-600 text-white rounded-3xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all flex flex-col items-center gap-3 group"
        >
          <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform">
            <DollarSign className="w-6 h-6" />
          </div>
          <span className="font-bold">Encaisser un paiement</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Revenus vs Dépenses (Mensuel)</h3>
            <TrendingUp className="text-slate-400 w-5 h-5" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(value) => `${(value / 1000).toLocaleString()}k`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value.toLocaleString()} FCFA`]}
                />
                <Legend iconType="circle" />
                <Bar dataKey="revenus" name="Revenus" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="depenses" name="Dépenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Répartition par Classe</h3>
            <GraduationCap className="text-slate-400 w-5 h-5" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classDistributionData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" name="Élèves" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800">Prochaines Échéances</h3>
              <Bell className="text-amber-500 w-5 h-5" />
            </div>
            <button 
              onClick={() => {
                setReminderModalInitialType('upcoming');
                setIsReminderModalOpen(true);
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Send className="w-3 h-3" />
              Rappels groupés
            </button>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {upcomingDeadlines.length === 0 ? (
              <div className="text-center py-8 text-slate-400 italic text-sm">Aucune échéance proche (7 jours)</div>
            ) : (
              upcomingDeadlines.map(({ student, type, days }, idx) => (
                <div key={`${student.id}-${type}-${idx}`} className="p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">{student.name}</p>
                      <p className="text-[10px] text-amber-600 font-bold uppercase">
                        {type === 'tranche1' ? 'Tranche 1' : 'Tranche 2'} • {days === 0 ? "Aujourd'hui" : `Dans ${days} jour(s)`}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleSendReminderWhatsApp(student, type, false)}
                    className="p-2 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-200 transition-colors"
                    title="Envoyer rappel WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleSendReminderSMS(student, type, false)}
                    className="p-2 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200 transition-colors"
                    title="Envoyer rappel SMS"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800">Retards de Paiement</h3>
              <AlertTriangle className="text-rose-500 w-5 h-5" />
            </div>
            <button 
              onClick={() => {
                setReminderModalInitialType('overdue');
                setIsReminderModalOpen(true);
              }}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 bg-rose-50 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Send className="w-3 h-3" />
              Rappels groupés
            </button>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {overdueStudentsList.length === 0 ? (
              <div className="text-center py-8 text-slate-400 italic text-sm">Aucun retard de paiement</div>
            ) : (
              overdueStudentsList.map(({ student, type, daysOverdue }, idx) => (
                <div key={`${student.id}-${type}-${idx}`} className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">{student.name}</p>
                      <p className="text-[10px] text-rose-600 font-bold uppercase">
                        {type === 'tranche1' ? 'Tranche 1' : 'Tranche 2'} • Retard de {daysOverdue} jour(s)
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleSendReminderWhatsApp(student, type, true)}
                    className="p-2 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-200 transition-colors"
                    title="Envoyer rappel WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleSendReminderSMS(student, type, true)}
                    className="p-2 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200 transition-colors"
                    title="Envoyer rappel SMS"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 lg:col-span-1">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Répartition des Dépenses</h3>
            <PieChartIcon className="text-slate-400 w-5 h-5" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseCategoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expenseCategoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`${value.toLocaleString()} FCFA`]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {expenseCategoryData.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 font-medium">{item.name}</span>
                </div>
                <span className="text-slate-400 font-bold">{((item.value / stats.totalExpenses) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Dernières Dépenses</h3>
            <DollarSign className="text-slate-400 w-5 h-5" />
          </div>
          <div className="space-y-4">
            {expenses.slice(0, 5).map(exp => (
              <div key={exp.id} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    exp.type === 'salaire' ? 'bg-purple-100 text-purple-600' : 
                    exp.type === 'travaux' ? 'bg-orange-100 text-orange-600' : 
                    exp.type === 'banque' ? 'bg-emerald-100 text-emerald-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{exp.description}</p>
                    <p className="text-xs text-slate-400 capitalize font-medium">{exp.type} • {exp.date}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-rose-500">-{exp.amount.toLocaleString()} FCFA</span>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="text-center py-8 text-slate-400 italic">Aucune dépense enregistrée</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAttendance = () => {
    // Ensure a class is selected by default if none is selected
    if (!selectedAttendanceClass && classes.length > 0) {
      setSelectedAttendanceClass(classes[0]);
    }

    const handleSaveAttendance = async (studentId: string, status: 'present' | 'absent' | 'late') => {
      const recordId = `${studentId}_${selectedAttendanceDate}`;
      const existingRecord = attendance.find(a => a.id === recordId);
      
      try {
        if (existingRecord) {
          await setDoc(doc(db, 'attendance', recordId), { ...existingRecord, status }, { merge: true });
        } else {
          await setDoc(doc(db, 'attendance', recordId), {
            id: recordId,
            studentId,
            date: selectedAttendanceDate,
            status,
            academicYear: selectedYear
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `attendance/${recordId}`);
      }
    };

    const handleSaveTeacherAttendance = async (teacherId: string, status: 'present' | 'absent' | 'late') => {
      const recordId = `${teacherId}_${selectedAttendanceDate}`;
      const existingRecord = teacherAttendance.find(a => a.id === recordId);
      
      try {
        if (existingRecord) {
          await setDoc(doc(db, 'teacher_attendance', recordId), { ...existingRecord, status }, { merge: true });
        } else {
          await setDoc(doc(db, 'teacher_attendance', recordId), {
            id: recordId,
            teacherId,
            date: selectedAttendanceDate,
            status,
            academicYear: selectedYear
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `teacher_attendance/${recordId}`);
      }
    };

    const classStudents = students.filter(s => 
      s.class === selectedAttendanceClass && 
      s.academicYear === selectedYear &&
      (isAdmin || isStaff || (isTeacher && currentUserData?.assignedClasses?.includes(s.class)))
    );
    const teachers = appUsers.filter(u => u.role === 'teacher');

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button 
              onClick={() => setAttendanceTab('students')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${attendanceTab === 'students' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Élèves
            </button>
            <button 
              onClick={() => setAttendanceTab('teachers')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${attendanceTab === 'teachers' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Enseignants
            </button>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button 
              onClick={exportAttendanceToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm shadow-emerald-200"
            >
              <Download className="w-4 h-4" />
              <span>Exporter Excel</span>
            </button>
            <input 
              type="date" 
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={selectedAttendanceDate}
              onChange={(e) => setSelectedAttendanceDate(e.target.value)}
            />
            {attendanceTab === 'students' && (
              <select 
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={selectedAttendanceClass}
                onChange={(e) => setSelectedAttendanceClass(e.target.value)}
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-bottom border-slate-100">
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{attendanceTab === 'students' ? 'Élève' : 'Enseignant'}</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Présent</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Absent</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">En retard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendanceTab === 'students' ? (
                  <>
                    {classStudents.map(student => {
                      const record = attendance.find(a => a.studentId === student.id && a.date === selectedAttendanceDate);
                      const status = record?.status || 'present';
                      
                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <p className="text-sm font-medium text-slate-700">{student.name}</p>
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="radio" 
                              name={`attendance_${student.id}`} 
                              checked={status === 'present'}
                              onChange={() => handleSaveAttendance(student.id, 'present')}
                              disabled={isArchivedYear}
                              className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="radio" 
                              name={`attendance_${student.id}`} 
                              checked={status === 'absent'}
                              onChange={() => handleSaveAttendance(student.id, 'absent')}
                              disabled={isArchivedYear}
                              className="w-4 h-4 text-rose-600 focus:ring-rose-500 disabled:opacity-50"
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="radio" 
                              name={`attendance_${student.id}`} 
                              checked={status === 'late'}
                              onChange={() => handleSaveAttendance(student.id, 'late')}
                              disabled={isArchivedYear}
                              className="w-4 h-4 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {classStudents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          Aucun élève dans cette classe.
                        </td>
                      </tr>
                    )}
                  </>
                ) : (
                  <>
                    {teachers.map(teacher => {
                      const record = teacherAttendance.find(a => a.teacherId === teacher.id && a.date === selectedAttendanceDate);
                      const status = record?.status || 'present';
                      
                      return (
                        <tr key={teacher.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <p className="text-sm font-medium text-slate-700">{teacher.name || teacher.email}</p>
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="radio" 
                              name={`teacher_attendance_${teacher.id}`} 
                              checked={status === 'present'}
                              onChange={() => handleSaveTeacherAttendance(teacher.id, 'present')}
                              className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="radio" 
                              name={`teacher_attendance_${teacher.id}`} 
                              checked={status === 'absent'}
                              onChange={() => handleSaveTeacherAttendance(teacher.id, 'absent')}
                              className="w-4 h-4 text-rose-600 focus:ring-rose-500"
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="radio" 
                              name={`teacher_attendance_${teacher.id}`} 
                              checked={status === 'late'}
                              onChange={() => handleSaveTeacherAttendance(teacher.id, 'late')}
                              className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {teachers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          Aucun enseignant enregistré.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

    const handleSaveGrade = async (grade: Partial<Grade>) => {
      if (!grade.studentId || !grade.subjectId || !grade.trimester || !grade.academicYear) return;
      
      const gradeId = grade.id || `${grade.studentId}_${grade.subjectId}_T${grade.trimester}_${grade.academicYear}`;
      
      try {
        await setDoc(doc(db, 'grades', gradeId), {
          ...grade,
          id: gradeId,
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `grades/${gradeId}`);
      }
    };

    const renderGrades = () => {
      const filteredStudentsForGrades = students.filter(s => 
        s.academicYear === selectedYear && 
        (selectedGradeClass === '' 
          ? (isAdmin || isStaff || (isTeacher && currentUserData?.assignedClasses?.includes(s.class))) 
          : s.class === selectedGradeClass)
      );

      const subjects = config.subjects || [];

      return (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <select 
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={selectedGradeTrimester}
                onChange={(e) => setSelectedGradeTrimester(Number(e.target.value) as 1 | 2 | 3 | 4)}
              >
                <option value={1}>1er Trimestre</option>
                <option value={2}>2ème Trimestre</option>
                <option value={3}>3ème Trimestre</option>
                <option value={4}>Annuel</option>
              </select>
              <select 
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={selectedGradeClass}
                onChange={(e) => setSelectedGradeClass(e.target.value)}
              >
                <option value="">Sélectionner une classe</option>
                {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select 
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={selectedGradeSubject}
                onChange={(e) => setSelectedGradeSubject(e.target.value)}
              >
                <option value="">Sélectionner une matière</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {selectedGradeClass && selectedGradeSubject && (
              <button 
                onClick={exportGradesToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Exporter vers Excel</span>
              </button>
            )}
          </div>

          {!selectedGradeClass || !selectedGradeSubject ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-200 text-center">
              <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Sélectionnez une classe et une matière</h3>
              <p className="text-slate-500">Veuillez choisir une classe et une matière pour commencer à saisir les notes.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-bottom border-slate-100">
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Élève</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Écrit (Moy)</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Oral</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">S. Être</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">TP</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Cote</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Observation</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudentsForGrades.map(student => {
                      if (selectedGradeTrimester === 4) {
                        const trimesterGrades = [1, 2, 3].map(t => grades.find(g => 
                          g.studentId === student.id && 
                          g.subjectId === selectedGradeSubject && 
                          g.trimester === t && 
                          g.academicYear === selectedYear
                        ));
                        
                        const averages = trimesterGrades.map(g => {
                          if (!g) return null;
                          const avg = calculateEcritAverage(g.evaluations.ecrit, student.class);
                          return avg !== 0 && avg !== '' ? avg : null;
                        }).filter(a => a !== null);

                        const isMaternelle = ['PS', 'MS', 'GS'].includes(student.class);
                        const annualMoy = averages.length > 0 
                          ? (isMaternelle 
                              ? averages[averages.length - 1] 
                              : (averages.reduce((a: any, b: any) => a + Number(b), 0) / averages.length).toFixed(2))
                          : '-';

                        return (
                          <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4">
                              <p className="text-sm font-medium text-slate-700">{student.name}</p>
                            </td>
                            <td className="p-4 text-center text-sm font-semibold text-indigo-600">
                              {annualMoy}
                            </td>
                            <td colSpan={5} className="p-4 text-center text-xs text-slate-400 italic">
                              Moyenne annuelle calculée sur {averages.length} trimestre(s)
                            </td>
                            <td className="p-4 text-right">
                              <span className="text-xs text-slate-300">N/A</span>
                            </td>
                          </tr>
                        );
                      }

                      const grade = grades.find(g => 
                        g.studentId === student.id && 
                        g.subjectId === selectedGradeSubject && 
                        g.trimester === selectedGradeTrimester && 
                        g.academicYear === selectedYear
                      );

                      const ecritMoy = grade?.evaluations.ecrit.length 
                        ? calculateEcritAverage(grade.evaluations.ecrit, student.class)
                        : '-';

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <p className="text-sm font-medium text-slate-700">{student.name}</p>
                          </td>
                          <td className="p-4 text-center text-sm font-semibold text-blue-600">
                            {typeof ecritMoy === 'number' ? ecritMoy.toFixed(2) : ecritMoy}
                          </td>
                          <td className="p-4 text-center text-sm text-slate-600">
                            {grade?.evaluations.oral[0] || '-'}
                          </td>
                          <td className="p-4 text-center text-sm text-slate-600">
                            {grade?.evaluations.s_etre[0] || '-'}
                          </td>
                          <td className="p-4 text-center text-sm text-slate-600">
                            {grade?.evaluations.tp[0] || '-'}
                          </td>
                          <td className="p-4 text-center">
                            <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">
                              {grade?.cote || '-'}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-slate-500 italic">
                            {grade?.observation || '-'}
                          </td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={() => {
                                // Open Grade Entry Modal
                                setEditingGrade({
                                  studentId: student.id,
                                  studentName: student.name,
                                  subjectId: selectedGradeSubject,
                                  trimester: selectedGradeTrimester,
                                  academicYear: selectedYear,
                                  ...(grade || {
                                    evaluations: { ecrit: [], oral: [], s_etre: [], tp: [] },
                                    cote: '',
                                    observation: ''
                                  })
                                });
                                setIsGradeModalOpen(true);
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {selectedGradeClass && (
            <div className="flex justify-end">
              <button 
                onClick={() => {
                  // Logic to generate/view report cards for the class
                  setCurrentReportCardClass(selectedGradeClass);
                  setIsReportCardListOpen(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
              >
                <Printer className="w-5 h-5" />
                <span>Bulletins de notes</span>
              </button>
            </div>
          )}
        </div>
      );
    };

  const renderStudents = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Rechercher un élève..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
          <select 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="All">Toutes les classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">Tous les statuts</option>
            <option value="N">Nouveaux</option>
            <option value="A">Anciens</option>
          </select>
          <select 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="All">Tous les paiements</option>
            <option value="paid">Soldé</option>
            <option value="partial">Partiel</option>
            <option value="unpaid">Non payé</option>
            <option value="tr1_incomplete">Tranche 1 non soldée</option>
            <option value="tr2_incomplete">Tranche 2 non soldée</option>
            <option value="total_incomplete">Scolarité non soldée</option>
            <option value="tr1_unpaid">Tranche 1 non payée</option>
            <option value="tr2_unpaid">Tranche 2 non payée</option>
            <option value="total_unpaid">Scolarité non payée</option>
          </select>
          <button 
            onClick={exportStudentsToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exporter</span>
          </button>
          <button 
            onClick={() => setIsImportModalOpen(true)}
            disabled={isArchivedYear}
            className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl transition-colors ${isArchivedYear ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
          >
            <FileUp className="w-4 h-4" />
            <span>Importer Excel</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            disabled={isArchivedYear}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl transition-colors ${isArchivedYear ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Inscrire un élève</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-bottom border-slate-100">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Élève</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Classe</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Inscription</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tr1 Versé</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-rose-500">Reste Tr1</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tr2 Versé</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-rose-500">Reste Tr2</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-rose-600">Reste Total</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Réduction</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map(student => (
                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-medium text-xs">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{student.name}</p>
                        <p className="text-xs text-slate-400">{student.gender === 'G' ? 'Garçon' : 'Fille'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600 font-medium">{student.class}</td>
                  <td className="p-4 text-sm text-slate-600">{student.regFee.toLocaleString()}</td>
                  <td className="p-4 text-sm text-slate-600">{student.tranche1.toLocaleString()}</td>
                  <td className="p-4 text-sm font-medium text-rose-500">
                    <div className="flex items-center gap-1">
                      {student.remainingTr1.toLocaleString()}
                      {student.remainingTr1 > 0 && isOverdue(student.tranche1Deadline || config.tranche1Deadline) && (
                        <AlertCircle className="w-4 h-4 text-rose-600" title={`En retard (Date limite: ${student.tranche1Deadline || config.tranche1Deadline})`} />
                      )}
                      {student.remainingTr1 > 0 && !isOverdue(student.tranche1Deadline || config.tranche1Deadline) && getDaysRemaining(student.tranche1Deadline || config.tranche1Deadline) !== null && getDaysRemaining(student.tranche1Deadline || config.tranche1Deadline)! <= (config.reminderThreshold || 7) && (
                        <AlertTriangle className="w-4 h-4 text-amber-500" title={`Échéance proche (${getDaysRemaining(student.tranche1Deadline || config.tranche1Deadline)} jours)`} />
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{student.tranche2.toLocaleString()}</td>
                  <td className="p-4 text-sm font-medium text-rose-500">
                    <div className="flex items-center gap-1">
                      {student.remainingTr2.toLocaleString()}
                      {student.remainingTr2 > 0 && isOverdue(student.tranche2Deadline || config.tranche2Deadline) && (
                        <AlertCircle className="w-4 h-4 text-rose-600" title={`En retard (Date limite: ${student.tranche2Deadline || config.tranche2Deadline})`} />
                      )}
                      {student.remainingTr2 > 0 && !isOverdue(student.tranche2Deadline || config.tranche2Deadline) && getDaysRemaining(student.tranche2Deadline || config.tranche2Deadline) !== null && getDaysRemaining(student.tranche2Deadline || config.tranche2Deadline)! <= (config.reminderThreshold || 7) && (
                        <AlertTriangle className="w-4 h-4 text-amber-500" title={`Échéance proche (${getDaysRemaining(student.tranche2Deadline || config.tranche2Deadline)} jours)`} />
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`text-sm font-bold ${student.totalRemaining > 0 ? 'text-rose-600' : 'text-emerald-500'}`}>
                      {student.totalRemaining.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {student.discount ? student.discount.toLocaleString() : '-'}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      student.status === 'A' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      {student.status === 'A' ? 'Ancien' : 'Nouveau'}
                    </span>
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    {!isArchivedYear && (
                      <button 
                        onClick={() => {
                          setEditingStudent(student);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Modifier l'élève"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {canWrite && !isArchivedYear && (
                      <button 
                        onClick={() => {
                          setSelectedStudentForPayment(student);
                          setIsPaymentModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ajouter un paiement"
                      >
                        <Wallet className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setSearchTerm(student.name);
                        setCurrentView('payments');
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Voir l'historique des paiements"
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                    {student.phone && (
                      <>
                      <button 
                        onClick={() => {
                          const status = getStudentPaymentStatus(student, config);
                          let message = `Bonjour,\n\nCeci est un message de l'école ${config.schoolName || "GSBCK GESTION"} concernant l'élève ${student.name} (${student.class}).\n\n`;
                          
                          if (status === 'Paid') {
                            message += `Nous vous informons que la scolarité est entièrement réglée. Merci pour votre confiance.`;
                          } else {
                            message += `Reste à payer : ${student.totalRemaining.toLocaleString()} FCFA.\n`;
                            if (student.remainingTr1 > 0) message += `- Tranche 1 : ${student.remainingTr1.toLocaleString()} FCFA\n`;
                            if (student.remainingTr2 > 0) message += `- Tranche 2 : ${student.remainingTr2.toLocaleString()} FCFA\n`;
                            message += `\nMerci de régulariser la situation dès que possible.`;
                          }
                          
                          sendWhatsAppMessage(student.phone, message);
                        }}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Envoyer un message WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          const status = getStudentPaymentStatus(student, config);
                          let message = `Bonjour,\n\nCeci est un message de l'école ${config.schoolName || "GSBCK GESTION"} concernant l'élève ${student.name} (${student.class}).\n\n`;
                          
                          if (status === 'Paid') {
                            message += `Nous vous informons que la scolarité est entièrement réglée. Merci pour votre confiance.`;
                          } else {
                            message += `Reste à payer : ${student.totalRemaining.toLocaleString()} FCFA.\n`;
                            if (student.remainingTr1 > 0) message += `- Tranche 1 : ${student.remainingTr1.toLocaleString()} FCFA\n`;
                            if (student.remainingTr2 > 0) message += `- Tranche 2 : ${student.remainingTr2.toLocaleString()} FCFA\n`;
                            message += `\nMerci de régulariser la situation dès que possible.`;
                          }
                          
                          sendSMSMessage(student.phone, message);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Envoyer un SMS"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      </>
                    )}
                    {!isArchivedYear && canWrite && (
                      <button 
                        onClick={() => handleDeleteStudent(student.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Supprimer l'élève"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderPayments = () => {
    const filteredPayments = payments.filter(p => {
      if (p.academicYear !== selectedYear) return false;
      if (paymentTypeFilter !== 'All' && p.type !== paymentTypeFilter) return false;
      if (searchTerm && !p.studentName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      
      if (paymentStartDate) {
        const [d, m, y] = p.date.split('/');
        const pDate = new Date(`${y}-${m}-${d}`);
        const start = new Date(paymentStartDate);
        if (pDate < start) return false;
      }
      if (paymentEndDate) {
        const [d, m, y] = p.date.split('/');
        const pDate = new Date(`${y}-${m}-${d}`);
        const end = new Date(paymentEndDate);
        if (pDate > end) return false;
      }
      
      if (classFilter !== 'All') {
        const student = students.find(s => s.id === p.studentId);
        if (student?.class !== classFilter) return false;
      }

      return true;
    });

    return (
      <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Rechercher un paiement (élève)..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <input 
            type="date" 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
            value={paymentStartDate}
            onChange={(e) => setPaymentStartDate(e.target.value)}
          />
          <input 
            type="date" 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
            value={paymentEndDate}
            onChange={(e) => setPaymentEndDate(e.target.value)}
          />
          <select 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={paymentTypeFilter}
            onChange={(e) => setPaymentTypeFilter(e.target.value)}
          >
            <option value="All">Tous les types</option>
            <option value="inscription">Inscription</option>
            <option value="tranche1">Tranche 1</option>
            <option value="tranche2">Tranche 2</option>
          </select>
          <select 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={paymentStatusFilter}
            onChange={(e) => setPaymentStatusFilter(e.target.value)}
          >
            <option value="All">Tous les statuts</option>
            <option value="Paid">Soldé</option>
            <option value="Pending">En attente</option>
            <option value="Overdue">En retard</option>
          </select>
          <select 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="All">Toutes les classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button 
            onClick={() => exportPaymentsToExcel(filteredPayments)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm shadow-emerald-200"
          >
            <Download className="w-4 h-4" />
            <span>Exporter Excel</span>
          </button>
          <button 
            onClick={() => setIsReminderModalOpen(true)}
            disabled={isArchivedYear}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl transition-all text-sm font-medium shadow-sm shadow-blue-200 ${isArchivedYear ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
          >
            <Send className="w-4 h-4" />
            Envoyer Rappels
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-bottom border-slate-100">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Élève</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Classe</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Montant</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Statut Élève</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments
                .filter(p => {
                  const student = students.find(s => s.id === p.studentId);
                  const matchesStatus = paymentStatusFilter === 'All' || (student && getStudentPaymentStatus(student, config) === paymentStatusFilter);
                  const matchesTeacher = !isTeacher || (student && currentUserData?.assignedClasses?.includes(student.class));
                  return matchesStatus && matchesTeacher;
                })
                .sort((a, b) => {
                  const [da, ma, ya] = a.date.split('/').map(Number);
                  const [db, mb, yb] = b.date.split('/').map(Number);
                  const dateA = new Date(ya, ma - 1, da).getTime();
                  const dateB = new Date(yb, mb - 1, db).getTime();
                  return dateB - dateA;
                })
                .map(payment => {
                  const student = students.find(s => s.id === payment.studentId);
                  const status = student ? getStudentPaymentStatus(student, config) : null;
                  return (
                <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-sm text-slate-500">{payment.date}</td>
                  <td className="p-4">
                    <p className="text-sm font-medium text-slate-700">{payment.studentName}</p>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-500">{student ? student.class : 'Inconnue'}</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                      payment.type === 'inscription' ? 'bg-blue-100 text-blue-600' : 
                      payment.type === 'tranche1' ? 'bg-purple-100 text-purple-600' : 
                      'bg-indigo-100 text-indigo-600'
                    }`}>
                      {payment.type === 'inscription' ? 'Inscription' : 
                       payment.type === 'tranche1' ? 'Tranche 1' : 'Tranche 2'}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-bold text-emerald-600">
                    +{payment.amount.toLocaleString()} FCFA
                  </td>
                  <td className="p-4">
                    {status === 'Paid' && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold uppercase">Soldé</span>}
                    {status === 'Pending' && <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-bold uppercase">En attente</span>}
                    {status === 'Overdue' && <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold uppercase">En retard</span>}
                    {!status && <span className="text-xs text-slate-400">-</span>}
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button 
                      onClick={() => handleSendPaymentWhatsApp(payment)}
                      className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Envoyer le reçu par WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleSendPaymentSMS(payment)}
                      className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Envoyer le reçu par SMS"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => generateReceipt(payment)}
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Télécharger le reçu PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedPaymentForReceipt(payment);
                        setIsReceiptModalOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Aperçu du reçu"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    {isAdmin && !isArchivedYear && (
                      <button 
                        onClick={() => handleDeletePayment(payment.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Supprimer le paiement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

  const handleUpdateConfig = async (newConfig: SchoolConfig) => {
    try {
      const cleanConfig = Object.fromEntries(
        Object.entries(newConfig).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'config', 'main'), cleanConfig);
    } catch (error) {
      console.error("Error updating config:", error);
      alert("Erreur lors de la mise à jour de la configuration.");
    }
  };

  const handleRenameClass = async (oldName: string, newName: string) => {
    if (!newName || newName === oldName) {
      setEditingClass(null);
      return;
    }
    
    if ((config.classes || []).includes(newName)) {
      setConfirmAction({
        title: "Erreur",
        message: "Cette classe existe déjà.",
        onConfirm: () => setIsConfirmModalOpen(false)
      });
      setIsConfirmModalOpen(true);
      return;
    }

    try {
      const newClasses = (config.classes || []).map(c => c === oldName ? newName : c);
      await handleUpdateConfig({ ...config, classes: newClasses });

      const studentsToUpdate = students.filter(s => s.class === oldName);
      if (studentsToUpdate.length > 0) {
        const batch = writeBatch(db);
        studentsToUpdate.forEach(student => {
          const studentRef = doc(db, 'students', student.id);
          batch.update(studentRef, { class: newName });
        });
        await batch.commit();
      }
      setEditingClass(null);
    } catch (error) {
      console.error("Error renaming class:", error);
      setConfirmAction({
        title: "Erreur",
        message: "Erreur lors du renommage de la classe.",
        onConfirm: () => setIsConfirmModalOpen(false)
      });
      setIsConfirmModalOpen(true);
    }
  };

  const handleDeleteClass = (className: string) => {
    const studentsInClass = students.filter(s => s.class === className);
    if (studentsInClass.length > 0) {
      setConfirmAction({
        title: "Action impossible",
        message: `Impossible de supprimer cette classe car elle contient ${studentsInClass.length} élève(s). Veuillez d'abord les transférer dans une autre classe.`,
        onConfirm: () => setIsConfirmModalOpen(false)
      });
      setIsConfirmModalOpen(true);
      return;
    }
    
    setConfirmAction({
      title: "Supprimer la classe",
      message: `Êtes-vous sûr de vouloir supprimer la classe "${className}" ?`,
      onConfirm: async () => {
        await handleUpdateConfig({
          ...config, 
          classes: (config.classes || []).filter(c => c !== className)
        });
        setIsConfirmModalOpen(false);
      }
    });
    setIsConfirmModalOpen(true);
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert("Votre navigateur ne supporte pas les notifications.");
      return;
    }
    
    try {
      // Check if we are in an iframe
      if (window.self !== window.top) {
        alert("Les notifications sont souvent bloquées dans l'aperçu. Veuillez ouvrir l'application dans un nouvel onglet pour les activer.");
      }
      
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        new Notification("GSBCK GESTION", {
          body: "Les notifications sont activées !",
        });
      } else if (permission === 'denied') {
        alert("Les notifications ont été bloquées. Veuillez les activer dans les paramètres de votre navigateur.");
      }
    } catch (error) {
      console.error("Notification permission error:", error);
      alert("Impossible d'activer les notifications dans cet environnement. Essayez d'ouvrir l'application dans un nouvel onglet.");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail) return;
    try {
      const newUserRef = doc(collection(db, 'users'));
      await setDoc(newUserRef, {
        email: newUserEmail,
        role: newUserRole,
        ...(newUserRole === 'teacher' ? { assignedClasses: newUserClasses } : {})
      });
      setNewUserEmail('');
      setNewUserRole('staff');
      setNewUserClasses([]);
    } catch (error) {
      console.error("Error adding user: ", error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
      console.error("Error deleting user: ", error);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: 'admin' | 'staff' | 'teacher') => {
    try {
      await setDoc(doc(db, 'users', userId), { 
        role: newRole,
        ...(newRole !== 'teacher' ? { assignedClasses: [] } : {})
      }, { merge: true });
    } catch (error) {
      console.error("Error updating user role: ", error);
    }
  };

  const handleUpdateUserClasses = async (userId: string, classes: string[]) => {
    try {
      await setDoc(doc(db, 'users', userId), { assignedClasses: classes }, { merge: true });
    } catch (error) {
      console.error("Error updating user classes: ", error);
    }
  };

  const renderFinances = () => {
    const filteredExpenses = expenses.filter(exp => {
      if (exp.academicYear !== selectedYear) return false;
      if (financeTab === 'salaries' && exp.type !== 'salaire') return false;
      if (financeTab === 'cotisations' && exp.type !== 'cotisation') return false;
      if (financeTab === 'overview' && (exp.type === 'salaire' || exp.type === 'cotisation')) return false;
      if ((financeTab === 'salaries' || financeTab === 'cotisations') && salaryTeacherFilter !== 'All' && exp.teacherId !== salaryTeacherFilter) return false;
      
      if (expenseStartDate && exp.date) {
        // Convert DD/MM/YYYY to YYYY-MM-DD for comparison
        const [d, m, y] = exp.date.split('/');
        const expDate = new Date(`${y}-${m}-${d}`);
        const start = new Date(expenseStartDate);
        if (expDate < start) return false;
      }
      if (expenseEndDate && exp.date) {
        const [d, m, y] = exp.date.split('/');
        const expDate = new Date(`${y}-${m}-${d}`);
        const end = new Date(expenseEndDate);
        if (expDate > end) return false;
      }
      return true;
    });

    const categoryData = [
      { name: 'Fonctionnement', value: filteredExpenses.filter(e => e.type === 'fonctionnement').reduce((a, b) => a + b.amount, 0), color: '#3b82f6' },
      { name: 'Salaires', value: filteredExpenses.filter(e => e.type === 'salaire').reduce((a, b) => a + b.amount, 0), color: '#a855f7' },
      { name: 'Travaux', value: filteredExpenses.filter(e => e.type === 'travaux').reduce((a, b) => a + b.amount, 0), color: '#f97316' },
      { name: 'Banque', value: filteredExpenses.filter(e => e.type === 'banque').reduce((a, b) => a + b.amount, 0), color: '#10b981' },
      { name: 'Cotisations', value: filteredExpenses.filter(e => e.type === 'cotisation').reduce((a, b) => a + b.amount, 0), color: '#ec4899' },
    ].filter(item => item.value > 0);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button 
              onClick={() => setFinanceTab('overview')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${financeTab === 'overview' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Aperçu & Dépenses
            </button>
            <button 
              onClick={() => setFinanceTab('salaries')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${financeTab === 'salaries' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Salaires
            </button>
            <button 
              onClick={() => setFinanceTab('cotisations')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${financeTab === 'cotisations' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Cotisations
            </button>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
              <Filter className="w-4 h-4 text-slate-400 ml-2" />
              <input 
                type="date" 
                className="text-sm border-none focus:ring-0 text-slate-600 bg-transparent"
                value={expenseStartDate}
                onChange={(e) => setExpenseStartDate(e.target.value)}
              />
              <span className="text-slate-300">-</span>
              <input 
                type="date" 
                className="text-sm border-none focus:ring-0 text-slate-600 bg-transparent"
                value={expenseEndDate}
                onChange={(e) => setExpenseEndDate(e.target.value)}
              />
              {(expenseStartDate || expenseEndDate) && (
                <button 
                  onClick={() => {
                    setExpenseStartDate('');
                    setExpenseEndDate('');
                  }}
                  className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-rose-500 transition-colors"
                  title="Effacer les filtres"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={() => handleExportCSV(filteredExpenses, financeTab === 'salaries' ? 'Salaires' : financeTab === 'cotisations' ? 'Cotisations' : 'Depenses')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
            
            {(financeTab === 'salaries' || financeTab === 'cotisations') && (
              <select 
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm shadow-sm"
                value={salaryTeacherFilter}
                onChange={(e) => setSalaryTeacherFilter(e.target.value)}
              >
                <option value="All">Tous les enseignants</option>
                {appUsers.filter(u => u.role === 'teacher').map(t => (
                  <option key={t.id} value={t.id}>{t.name || t.email}</option>
                ))}
              </select>
            )}

            <button 
              onClick={() => {
                const isSalaries = financeTab === 'salaries';
                const isCotisations = financeTab === 'cotisations';
                const headers = (isSalaries || isCotisations)
                  ? ['Date', 'Type', 'Enseignant', 'Description', 'Montant', 'Année Académique']
                  : ['Date', 'Type', 'Description', 'Montant', 'Année Académique'];
                
                const csvContent = [
                  headers.join(','),
                  ...filteredExpenses.map(e => {
                    if (isSalaries || isCotisations) {
                      const teacher = appUsers.find(u => u.id === e.teacherId);
                      const teacherName = teacher ? (teacher.name || teacher.email) : 'N/A';
                      return [
                        e.date,
                        e.type,
                        `"${teacherName}"`,
                        `"${e.description}"`,
                        e.amount,
                        e.academicYear
                      ].join(',');
                    }
                    return [
                      e.date,
                      e.type,
                      `"${e.description}"`,
                      e.amount,
                      e.academicYear
                    ].join(',');
                  })
                ].join('\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                const filenamePrefix = isSalaries ? 'salaires' : isCotisations ? 'cotisations' : 'finances';
                link.download = `${filenamePrefix}_${selectedYear.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">
                {financeTab === 'salaries' ? 'Exporter Rapport Salaires' : financeTab === 'cotisations' ? 'Exporter Rapport Cotisations' : 'Exporter'}
              </span>
            </button>
          </div>
        </div>

        {financeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-400 mb-1">Fonctionnement</p>
              <p className="text-2xl font-bold text-slate-800">
                {filteredExpenses.filter(e => e.type === 'fonctionnement').reduce((a, b) => a + b.amount, 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span>
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-400 mb-1">Travaux</p>
              <p className="text-2xl font-bold text-slate-800">
                {filteredExpenses.filter(e => e.type === 'travaux').reduce((a, b) => a + b.amount, 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span>
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-400 mb-1">Banque</p>
              <p className="text-2xl font-bold text-slate-800">
                {filteredExpenses.filter(e => e.type === 'banque').reduce((a, b) => a + b.amount, 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span>
              </p>
            </div>
          </div>
        )}

        {financeTab === 'salaries' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="text-sm text-slate-400 mb-1">Total Salaires Versés</p>
              <p className="text-2xl font-bold text-slate-800">
                {filteredExpenses.filter(e => e.type === 'salaire').reduce((a, b) => a + b.amount, 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span>
              </p>
            </div>
            <button 
              onClick={() => {
                const salaryExpenses = filteredExpenses.filter(e => e.type === 'salaire');
                const headers = ['Date', 'Enseignant', 'Description', 'Montant', 'Année Académique'];
                const csvContent = [
                  headers.join(','),
                  ...salaryExpenses.map(e => {
                    const teacher = appUsers.find(u => u.id === e.teacherId);
                    const teacherName = teacher ? (teacher.name || teacher.email) : 'N/A';
                    return [
                      e.date,
                      `"${teacherName}"`,
                      `"${e.description}"`,
                      e.amount,
                      e.academicYear
                    ].join(',');
                  })
                ].join('\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `rapport_salaires_${selectedYear.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exporter Rapport Salaires</span>
            </button>
          </div>
        )}

        {financeTab === 'cotisations' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="text-sm text-slate-400 mb-1">Total Cotisations Reçues</p>
              <p className="text-2xl font-bold text-slate-800">
                {filteredExpenses.filter(e => e.type === 'cotisation').reduce((a, b) => a + b.amount, 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">FCFA</span>
              </p>
            </div>
            <button 
              onClick={() => {
                const cotisationExpenses = filteredExpenses.filter(e => e.type === 'cotisation');
                const headers = ['Date', 'Enseignant', 'Description', 'Montant', 'Année Académique'];
                const csvContent = [
                  headers.join(','),
                  ...cotisationExpenses.map(e => {
                    const teacher = appUsers.find(u => u.id === e.teacherId);
                    const teacherName = teacher ? (teacher.name || teacher.email) : 'N/A';
                    return [
                      e.date,
                      `"${teacherName}"`,
                      `"${e.description}"`,
                      e.amount,
                      e.academicYear
                    ].join(',');
                  })
                ].join('\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `rapport_cotisations_${selectedYear.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exporter Rapport Cotisations</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Flux de Trésorerie Mensuel</h3>
                <p className="text-sm text-slate-400">Revenus vs Dépenses pour {selectedYear}</p>
              </div>
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickFormatter={(value) => `${value / 1000}k`}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`${value.toLocaleString()} FCFA`]}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 600 }}
                  />
                  <Bar 
                    name="Revenus" 
                    dataKey="revenus" 
                    fill="#10b981" 
                    radius={[4, 4, 0, 0]} 
                    barSize={20}
                  />
                  <Bar 
                    name="Dépenses" 
                    dataKey="depenses" 
                    fill="#f43f5e" 
                    radius={[4, 4, 0, 0]} 
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Répartition</h3>
                <p className="text-sm text-slate-400">Par catégorie</p>
              </div>
              <PieChartIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="h-[300px] w-full">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`${value.toLocaleString()} FCFA`]}
                    />
                    <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Aucune donnée de dépense
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-4">
            <h3 className="font-semibold text-slate-800">
              {financeTab === 'overview' ? 'Historique des Dépenses' : financeTab === 'salaries' ? 'Historique des Salaires' : 'Historique des Cotisations'}
            </h3>
            <div className="flex gap-2">
              <button 
                onClick={() => exportFinancesToExcel(filteredExpenses)}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors hover:bg-emerald-700"
              >
                <Download className="w-4 h-4" />
                Exporter Excel
              </button>
              <button 
                onClick={() => {
                  setEditingExpense(null);
                  setIsExpenseModalOpen(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                {financeTab === 'overview' ? 'Nouvelle Dépense' : financeTab === 'salaries' ? 'Nouveau Salaire' : 'Nouvelle Cotisation'}
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredExpenses.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Aucune donnée trouvée pour cette période.</div>
            ) : (
              filteredExpenses.map(exp => (
                <div key={exp.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      exp.type === 'salaire' ? 'bg-purple-100 text-purple-600' : 
                      exp.type === 'travaux' ? 'bg-orange-100 text-orange-600' : 
                      exp.type === 'banque' ? 'bg-emerald-100 text-emerald-600' :
                      exp.type === 'cotisation' ? 'bg-pink-100 text-pink-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      {exp.type === 'salaire' ? <Users className="w-5 h-5" /> : 
                       exp.type === 'travaux' ? <TrendingUp className="w-5 h-5" /> : 
                       exp.type === 'banque' ? <CreditCard className="w-5 h-5" /> :
                       exp.type === 'cotisation' ? <DollarSign className="w-5 h-5" /> :
                       <Wallet className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{exp.description}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">{exp.type}</p>
                        <span className="text-xs text-slate-300">•</span>
                        <p className="text-xs text-slate-400">{exp.date}</p>
                        {(exp.type === 'salaire' || exp.type === 'cotisation') && exp.teacherId && (
                          <>
                            <span className="text-xs text-slate-300">•</span>
                            <p className="text-xs text-slate-400 font-medium">
                              {appUsers.find(u => u.id === exp.teacherId)?.name || 'Enseignant inconnu'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <p className={`text-sm font-bold ${exp.type === 'cotisation' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {exp.type === 'cotisation' ? '+' : '-'}{exp.amount.toLocaleString()} FCFA
                    </p>
                    <button 
                      onClick={() => {
                        setEditingExpense(exp);
                        setIsExpenseModalOpen(true);
                      }}
                      className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                      title="Modifier la dépense"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                      title="Supprimer la dépense"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-card-foreground">{user?.email}</p>
            <p className="text-xs text-card-foreground/50 uppercase tracking-wider font-bold">
              Rôle : {currentUserData?.role || (isSuperAdmin ? 'Super Admin' : 'Inconnu')}
            </p>
          </div>
        </div>
        {!isAdmin && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-medium">Accès restreint</span>
          </div>
        )}
      </div>

      <div className="bg-card p-8 rounded-3xl shadow-sm border border-border space-y-6">
        <h3 className="text-xl font-bold text-card-foreground flex items-center gap-2">
          <Heart className="w-6 h-6 text-rose-500" />
          Personnalisation du Thème
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { id: 'default', name: 'Défaut (Bleu)', color: 'bg-blue-600' },
            { id: 'dark', name: 'Sombre', color: 'bg-slate-900' },
            { id: 'warm', name: 'Chaleureux', color: 'bg-orange-500' },
            { id: 'professional', name: 'Professionnel', color: 'bg-indigo-600' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => handleUpdateConfig({...config, theme: t.id as any})}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${
                config.theme === t.id 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/30 bg-card'
              }`}
            >
              <div className={`w-12 h-12 rounded-full ${t.color} shadow-lg`} />
              <span className="text-sm font-semibold text-card-foreground">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card p-8 rounded-3xl shadow-sm border border-border space-y-6">
        <h3 className="text-xl font-bold text-card-foreground flex items-center gap-2">
          <Building className="w-6 h-6 text-primary" />
          Informations de l'École (Reçus)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-card-foreground/60">Nom de l'école</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
              value={config.schoolName || ''}
              onChange={(e) => handleUpdateConfig({...config, schoolName: e.target.value})}
              placeholder="Ex: Groupe Scolaire Bilingue..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-card-foreground/60">Adresse</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
              value={config.schoolAddress || ''}
              onChange={(e) => handleUpdateConfig({...config, schoolAddress: e.target.value})}
              placeholder="Ex: BP 123, Quartier, Ville"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-card-foreground/60">Téléphone</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
              value={config.schoolPhone || ''}
              onChange={(e) => handleUpdateConfig({...config, schoolPhone: e.target.value})}
              placeholder="Ex: +237 600 000 000"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-card-foreground/60">Email</label>
            <input 
              type="email" 
              className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
              value={config.schoolEmail || ''}
              onChange={(e) => handleUpdateConfig({...config, schoolEmail: e.target.value})}
              placeholder="Ex: contact@ecole.com"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-card-foreground/60">Logo (URL ou Base64)</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
              value={config.schoolLogo || ''}
              onChange={(e) => handleUpdateConfig({...config, schoolLogo: e.target.value})}
              placeholder="https://... ou data:image/png;base64,..."
            />
            {config.schoolLogo && (
              <div className="mt-4 p-4 bg-accent rounded-xl border border-border inline-block">
                <p className="text-xs text-card-foreground/50 mb-2">Aperçu du logo :</p>
                <img src={config.schoolLogo} alt="Logo de l'école" className="h-16 object-contain" />
              </div>
            )}
          </div>
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="bg-card p-8 rounded-3xl shadow-sm border border-border space-y-6">
          <h3 className="text-xl font-bold text-card-foreground flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" />
            Configuration des Frais et Échéances
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">Inscription</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.registrationFee}
                onChange={(e) => handleUpdateConfig({...config, registrationFee: parseInt(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">Tranche 1</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.tranche1Fee}
                onChange={(e) => handleUpdateConfig({...config, tranche1Fee: parseInt(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">Tranche 2</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.tranche2Fee}
                onChange={(e) => handleUpdateConfig({...config, tranche2Fee: parseInt(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">Tranche 2 (Maternelle)</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.tranche2FeeMaternelle || 20000}
                onChange={(e) => handleUpdateConfig({...config, tranche2FeeMaternelle: parseInt(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">Date limite Tranche 1</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.tranche1Deadline ? config.tranche1Deadline.split('/').reverse().join('-') : ''}
                onChange={(e) => {
                  const dateVal = e.target.value;
                  const formatted = dateVal ? dateVal.split('-').reverse().join('/') : '';
                  handleUpdateConfig({...config, tranche1Deadline: formatted});
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">Date limite Tranche 2</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.tranche2Deadline ? config.tranche2Deadline.split('/').reverse().join('-') : ''}
                onChange={(e) => {
                  const dateVal = e.target.value;
                  const formatted = dateVal ? dateVal.split('-').reverse().join('/') : '';
                  handleUpdateConfig({...config, tranche2Deadline: formatted});
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">Seuil de rappel (jours)</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.reminderThreshold || 7}
                onChange={(e) => handleUpdateConfig({...config, reminderThreshold: parseInt(e.target.value) || 0})}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                Modèle de message WhatsApp (Rappels)
              </label>
              <textarea 
                rows={3}
                className="w-full px-4 py-3 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-sm text-card-foreground"
                value={config.whatsappTemplate || ''}
                onChange={(e) => handleUpdateConfig({...config, whatsappTemplate: e.target.value})}
                placeholder="Cher parent, nous vous rappelons que le solde de [NOM_ELEVE] est de [MONTANT_RESTANT] FCFA..."
              />
              <p className="text-[10px] text-card-foreground/40 italic">
                Variables disponibles : [NOM_ELEVE], [MONTANT_RESTANT], [DATE_LIMITE]
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary" />
                Modèle de reçu WhatsApp (Confirmation de paiement)
              </label>
              <textarea 
                rows={3}
                className="w-full px-4 py-3 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-sm text-card-foreground"
                value={config.paymentConfirmationTemplate || ''}
                onChange={(e) => handleUpdateConfig({...config, paymentConfirmationTemplate: e.target.value})}
                placeholder="Reçu de paiement pour [NOM_ELEVE]. Montant versé: [MONTANT_PAYE] FCFA..."
              />
              <p className="text-[10px] text-card-foreground/40 italic">
                Variables disponibles : [NOM_ELEVE], [MONTANT_PAYE], [RESTE_T1], [ECHEANCE_T1], [RESTE_T2], [ECHEANCE_T2], [TOTAL_RESTANT]
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card p-8 rounded-3xl shadow-sm border border-border space-y-6">
          <h3 className="text-xl font-bold text-card-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Intégration Google Sheets
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-accent rounded-2xl border border-border">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isGoogleConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div>
                  <p className="text-sm font-semibold text-card-foreground">
                    {isGoogleConnected ? 'Compte Google connecté' : 'Compte Google non connecté'}
                  </p>
                  <p className="text-xs text-card-foreground/50">
                    {isGoogleConnected ? 'Prêt pour la synchronisation en temps réel' : 'Connectez-vous pour activer la synchronisation'}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleConnectGoogle}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${isGoogleConnected ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                {isGoogleConnected ? 'Changer de compte' : 'Se connecter avec Google'}
              </button>
            </div>

            {isGoogleConnected && !config.spreadsheetId && (
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Configuration rapide</p>
                  <p className="text-xs text-emerald-600">Créez automatiquement un fichier configuré pour votre école.</p>
                </div>
                <button 
                  onClick={handleCreateSpreadsheet}
                  disabled={isCreatingSpreadsheet}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreatingSpreadsheet ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Création...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      Créer le fichier
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground/60">ID de la feuille de calcul (Spreadsheet ID)</label>
              <input 
                type="text" 
                className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
                value={config.spreadsheetId || ''}
                onChange={(e) => handleUpdateConfig({...config, spreadsheetId: e.target.value})}
                placeholder="Ex: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
              />
              <p className="text-[10px] text-card-foreground/40 italic">
                L'ID se trouve dans l'URL de votre fichier Google Sheets : docs.google.com/spreadsheets/d/<b>[ID_ICI]</b>/edit
              </p>
            </div>
            
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <p className="text-xs text-blue-700 leading-relaxed">
                <b>Note :</b> Assurez-vous que votre fichier Google Sheets possède deux feuilles nommées <b>"Eleves"</b> et <b>"Paiements"</b>. Les données y seront ajoutées automatiquement à chaque enregistrement.
              </p>
            </div>
          </div>
        </div>
      </>
      )}

      <div className="bg-card p-8 rounded-3xl shadow-sm border border-border space-y-6">
        <h3 className="text-xl font-bold text-card-foreground flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          Années Académiques
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-card-foreground/60">Année Courante</label>
            <select 
              className="w-full px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
              value={config.currentAcademicYear}
              onChange={(e) => handleUpdateConfig({...config, currentAcademicYear: e.target.value})}
            >
              {(config.academicYears || []).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-card-foreground/60">Ajouter une Année</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                id="new-year-input"
                placeholder="ex: 2026-2027"
                className="flex-1 px-4 py-2 bg-accent border border-border rounded-xl focus:ring-2 focus:ring-primary/20 text-card-foreground"
              />
              <button 
                onClick={() => {
                  const input = document.getElementById('new-year-input') as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !(config.academicYears || []).includes(val)) {
                    handleUpdateConfig({...config, academicYears: [...(config.academicYears || []), val]});
                    input.value = '';
                  }
                }}
                className="p-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.academicYears || []).map(year => (
            <div key={year} className="flex items-center gap-2 px-3 py-1.5 bg-accent text-card-foreground/70 rounded-lg text-sm font-medium">
              {year}
              {config.archivedYears?.includes(year) && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase font-bold">Archivée</span>
              )}
              {year !== config.currentAcademicYear && !config.archivedYears?.includes(year) && (
                <button 
                  onClick={() => handleUpdateConfig({...config, academicYears: (config.academicYears || []).filter(y => y !== year)})}
                  className="hover:text-rose-500"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card p-8 rounded-3xl shadow-sm border border-border space-y-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Archive className="w-6 h-6 text-amber-600" />
          Archivage des Données
        </h3>
        <p className="text-sm text-slate-500">
          L'archivage permet de figer les données d'une année passée. Les années archivées restent consultables mais ne sont plus modifiables.
        </p>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-sm font-semibold text-slate-500">Sélectionner l'année à archiver</label>
            <select 
              id="archive-year-select"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            >
              {(config.academicYears || [])
                .filter(y => y !== config.currentAcademicYear && !(config.archivedYears || []).includes(y))
                .map(year => (
                  <option key={year} value={year}>{year}</option>
                ))
              }
            </select>
          </div>
          <button 
            onClick={() => {
              const select = document.getElementById('archive-year-select') as HTMLSelectElement;
              const year = select.value;
              if (year && !config.archivedYears?.includes(year)) {
                handleUpdateConfig({
                  ...config, 
                  archivedYears: [...(config.archivedYears || []), year]
                });
              }
            }}
            className="px-6 py-2 bg-amber-100 text-amber-700 font-semibold rounded-xl hover:bg-amber-200 transition-colors disabled:opacity-50"
            disabled={!(config.academicYears || []).some(y => y !== config.currentAcademicYear && !(config.archivedYears || []).includes(y))}
          >
            Archiver l'Année
          </button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-blue-600" />
          Gestion des Classes
        </h3>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(config.classes || []).map((cls, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg font-medium group relative">
                {editingClass?.oldName === cls ? (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRenameClass(cls, editingClass.newName);
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="text"
                      autoFocus
                      className="px-2 py-1 bg-white border border-blue-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-32"
                      value={editingClass.newName}
                      onChange={(e) => setEditingClass({ ...editingClass, newName: e.target.value })}
                    />
                    <button type="submit" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Enregistrer">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setEditingClass(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded" title="Annuler">
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span>{cls}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setEditingClass({ oldName: cls, newName: cls })}
                        className="p-1 hover:text-blue-600 hover:bg-blue-100 rounded"
                        title="Modifier"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClass(cls)}
                        className="p-1 hover:text-rose-600 hover:bg-rose-100 rounded"
                        title="Supprimer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const input = document.getElementById('new-class-input') as HTMLInputElement;
              const name = input.value.trim();
              if (name && !(config.classes || []).includes(name)) {
                handleUpdateConfig({...config, classes: [...(config.classes || []), name]});
                input.value = '';
              } else if ((config.classes || []).includes(name)) {
                setConfirmAction({
                  title: "Erreur",
                  message: "Cette classe existe déjà.",
                  onConfirm: () => setIsConfirmModalOpen(false)
                });
                setIsConfirmModalOpen(true);
              }
            }}
            className="flex items-center gap-2 max-w-sm"
          >
            <input 
              type="text" 
              id="new-class-input"
              placeholder="Nouvelle classe..." 
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm"
            />
            <button 
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-blue-600" />
          Gestion des Réductions
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(config.discounts || []).map((discount) => (
              <div key={discount.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{discount.name}</p>
                  <p className="text-sm text-slate-500">
                    {discount.type === 'percentage' ? `${discount.value}%` : `${discount.value.toLocaleString()} FCFA`}
                  </p>
                </div>
                <button 
                  onClick={() => handleUpdateConfig({...config, discounts: (config.discounts || []).filter(d => d.id !== discount.id)})}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button 
            onClick={() => setIsDiscountModalOpen(true)}
            className="px-4 py-2 border border-dashed border-slate-300 text-slate-500 rounded-xl hover:border-blue-500 hover:text-blue-500 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Ajouter une réduction
          </button>
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-600" />
              Gestion des Utilisateurs
            </h3>
            
            <form onSubmit={handleAddUser} className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px] space-y-2">
                <label className="text-sm font-semibold text-slate-500">Adresse e-mail</label>
                <input 
                  type="email" 
                  required
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="email@exemple.com"
                />
              </div>
              <div className="w-48 space-y-2">
                <label className="text-sm font-semibold text-slate-500">Rôle</label>
                <select 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'staff' | 'teacher')}
                >
                  <option value="staff">Staff (Lecture/Écriture)</option>
                  <option value="admin">Admin (Accès total)</option>
                  <option value="teacher">Enseignant (Ses classes)</option>
                </select>
              </div>
              {newUserRole === 'teacher' && (
                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-sm font-semibold text-slate-500">Classes assignées</label>
                  <div className="flex flex-wrap gap-2">
                    {config.classes?.map(c => (
                      <label key={c} className="flex items-center gap-1 text-sm bg-slate-50 px-2 py-1 rounded border border-slate-200 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={newUserClasses.includes(c)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUserClasses([...newUserClasses, c]);
                            } else {
                              setNewUserClasses(newUserClasses.filter(cls => cls !== c));
                            }
                          }}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button 
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </form>

            <div className="mt-6 border border-slate-100 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rôle</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Classes (Enseignant)</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-sm font-medium text-slate-700">{u.email}</td>
                      <td className="p-4">
                        <select 
                          className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20"
                          value={u.role}
                          onChange={(e) => handleUpdateUserRole(u.id, e.target.value as 'admin' | 'staff' | 'teacher')}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                          <option value="teacher">Enseignant</option>
                        </select>
                      </td>
                      <td className="p-4">
                        {u.role === 'teacher' ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {config.classes?.map(c => (
                              <label key={c} className="flex items-center gap-1 text-xs bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={u.assignedClasses?.includes(c) || false}
                                  onChange={(e) => {
                                    const currentClasses = u.assignedClasses || [];
                                    if (e.target.checked) {
                                      handleUpdateUserClasses(u.id, [...currentClasses, c]);
                                    } else {
                                      handleUpdateUserClasses(u.id, currentClasses.filter(cls => cls !== c));
                                    }
                                  }}
                                />
                                {c}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Supprimer l'utilisateur"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {appUsers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500 text-sm">
                        Aucun utilisateur supplémentaire configuré.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Download className="w-6 h-6 text-blue-600" />
              Sauvegarde et Restauration
            </h3>
            <p className="text-sm text-slate-500">
              Exportez toutes les données de l'école dans un fichier JSON pour les sauvegarder, ou restaurez-les à partir d'un fichier existant.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={handleExportAllToExcel}
                className="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exporter vers Excel (Google Sheets)
              </button>
              <button 
                onClick={handleExportData}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exporter les données
              </button>
              <label className="px-6 py-2 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2 cursor-pointer">
                <TrendingUp className="w-4 h-4" />
                Restaurer les données
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleImportData}
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg-main flex print:block print:bg-white transition-colors duration-300">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-all duration-300 lg:translate-x-0 lg:static lg:h-screen ${isReceiptModalOpen ? 'print:hidden' : ''}
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-primary">
            <div className="bg-primary p-2 rounded-xl text-primary-foreground">
              <GraduationCap className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-card-foreground">GSBCK GESTION</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavItem 
            active={currentView === 'dashboard'} 
            onClick={() => {
              setCurrentView('dashboard');
              setIsSidebarOpen(false);
            }}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Tableau de bord"
          />
          <NavItem 
            active={currentView === 'students'} 
            onClick={() => {
              setCurrentView('students');
              setIsSidebarOpen(false);
            }}
            icon={<Users className="w-5 h-5" />}
            label="Élèves"
          />
          <NavItem 
            active={currentView === 'attendance'} 
            onClick={() => {
              setCurrentView('attendance');
              setIsSidebarOpen(false);
            }}
            icon={<Calendar className="w-5 h-5" />}
            label="Présences"
          />
          {canViewPayments && (
            <NavItem 
              active={currentView === 'payments'} 
              onClick={() => {
                setCurrentView('payments');
                setIsSidebarOpen(false);
              }}
              icon={<Receipt className="w-5 h-5" />}
              label="Paiements"
            />
          )}
          {canViewFinances && (
            <NavItem 
              active={currentView === 'finances'} 
              onClick={() => {
                setCurrentView('finances');
                setIsSidebarOpen(false);
              }}
              icon={<Wallet className="w-5 h-5" />}
              label="Finances"
            />
          )}
          <NavItem 
            active={currentView === 'grades'} 
            onClick={() => {
              setCurrentView('grades');
              setIsSidebarOpen(false);
            }}
            icon={<BarChart3 className="w-5 h-5" />}
            label="Notes"
          />
          {canViewSettings && (
            <NavItem 
              active={currentView === 'settings'} 
              onClick={() => {
                setCurrentView('settings');
                setIsSidebarOpen(false);
              }}
              icon={<Settings className="w-5 h-5" />}
              label="Paramètres"
            />
          )}
        </nav>

        <div className="p-4 mt-auto border-t border-border">
          <div className="bg-accent p-4 rounded-2xl">
            <p className="text-xs font-semibold text-card-foreground/40 uppercase mb-2">Support</p>
            <p className="text-sm text-card-foreground/70 mb-3">Besoin d'aide pour la gestion ?</p>
            <button className="w-full py-2 bg-card border border-border text-card-foreground text-sm font-medium rounded-xl hover:bg-accent transition-colors">
              Contactez-nous
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 min-w-0 overflow-auto ${isReceiptModalOpen ? 'print:hidden' : ''}`}>
        <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-card-foreground/50 hover:bg-accent rounded-lg transition-colors">
                <Menu className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold text-card-foreground capitalize">
                {currentView === 'dashboard' ? 'Tableau de bord' : 
                 currentView === 'students' ? 'Gestion des élèves' : 
                 currentView === 'payments' ? 'Historique des paiements' :
                 currentView === 'finances' ? 'Gestion financière' : 
                 currentView === 'grades' ? 'Gestion des notes' : 'Paramètres'}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${isOnline ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse'}`}>
                {isOnline ? (
                  <>
                    <Wifi className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">En ligne</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Hors connexion</span>
                  </>
                )}
              </div>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                {(config.academicYears || []).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <div className="relative">
                <button 
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all relative"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.some(n => !n.read) && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
                  )}
                </button>

                <AnimatePresence>
                  {isNotificationOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50"
                    >
                      <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                        <h3 className="font-bold text-slate-800">Notifications</h3>
                        {notificationPermission === 'default' && (
                          <button 
                            onClick={requestNotificationPermission}
                            className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider"
                          >
                            Activer
                          </button>
                        )}
                        {notificationPermission === 'denied' && (
                          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                            Bloqué
                          </span>
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map(n => (
                            <div 
                              key={n.id} 
                              className={`p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${!n.read ? 'bg-blue-50/30' : ''}`}
                              onClick={() => {
                                setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif));
                              }}
                            >
                              <div className="flex gap-3">
                                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                  n.type === 'warning' ? 'bg-amber-500' : 
                                  n.type === 'error' ? 'bg-rose-500' : 
                                  n.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                                }`} />
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    <p className="text-[10px] text-slate-400 font-medium">
                                      {new Date(n.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    {n.action && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          n.action?.();
                                          setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif));
                                        }}
                                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                                      >
                                        Ouvrir
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center">
                            <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm text-slate-500">Aucune notification pour le moment.</p>
                          </div>
                        )}
                      </div>
                      {notifications.length > 0 && (
                        <button 
                          onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                          className="w-full p-3 text-xs font-bold text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors border-t border-slate-50"
                        >
                          Tout marquer comme lu
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <Download className="w-5 h-5" />
              </button>
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                AD
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {currentView === 'dashboard' && renderDashboard()}
              {currentView === 'students' && renderStudents()}
              {currentView === 'attendance' && renderAttendance()}
              {currentView === 'payments' && renderPayments()}
              {currentView === 'finances' && renderFinances()}
              {currentView === 'grades' && renderGrades()}
              {currentView === 'settings' && renderSettings()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <RegistrationModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingStudent(null);
        }} 
        onAdd={editingStudent ? (data) => handleUpdateStudent(editingStudent.id, data) : handleAddStudent}
        classes={availableClasses}
        isSubmitting={isSubmitting}
        config={config}
        student={editingStudent}
        isAdmin={isAdmin}
        canWrite={canWrite}
      />

      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        onAdd={editingExpense ? (data) => handleUpdateExpense(editingExpense.id, data) : handleAddExpense}
        isSubmitting={isSubmitting}
        expense={editingExpense}
        defaultType={financeTab === 'salaries' ? 'salaire' : financeTab === 'cotisations' ? 'cotisation' : 'fonctionnement'}
        teachers={appUsers.filter(u => u.role === 'teacher')}
      />

      <ConfirmModal 
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={confirmAction?.onConfirm || (() => {})}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
      />

      <DiscountModal
        isOpen={isDiscountModalOpen}
        onClose={() => setIsDiscountModalOpen(false)}
        onAdd={async (discount) => {
          const newDiscount = {
            id: Math.random().toString(36).substr(2, 9),
            ...discount
          };
          await handleUpdateConfig({...config, discounts: [...(config.discounts || []), newDiscount]});
          setIsDiscountModalOpen(false);
        }}
      />

      {selectedStudentForPayment && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedStudentForPayment(null);
          }}
          onAdd={handleAddPayment}
          student={selectedStudentForPayment}
          isSubmitting={isSubmitting}
          config={config}
        />
      )}

      <ReceiptModal 
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setSelectedPaymentForReceipt(null);
        }}
        payment={selectedPaymentForReceipt}
        student={students.find(s => s.id === selectedPaymentForReceipt?.studentId) || null}
        onDownloadPDF={generateReceipt}
        config={config}
      />
      <ReminderModal 
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        students={students}
        config={config}
        initialType={reminderModalInitialType}
      />

      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportExcel}
        config={config}
      />

      <GradeModal 
        isOpen={isGradeModalOpen}
        onClose={() => {
          setIsGradeModalOpen(false);
          setEditingGrade(null);
        }}
        student={students.find(s => s.id === editingGrade?.studentId) || null}
        subject={config.subjects?.find(s => s.id === editingGrade?.subjectId) || null}
        trimester={editingGrade?.trimester || 1}
        academicYear={config.currentAcademicYear}
        grade={editingGrade}
        onSave={handleSaveGrade}
      />

      <ReportCardListModal 
        isOpen={isReportCardListOpen}
        onClose={() => setIsReportCardListOpen(false)}
        className={currentReportCardClass}
        students={students}
        grades={grades}
        reportCards={reportCards}
        trimester={selectedGradeTrimester}
        academicYear={config.currentAcademicYear}
        onOpenReportCard={(student) => {
          setSelectedReportCardStudent(student);
          setIsReportCardModalOpen(true);
        }}
      />

      <ReportCardModal 
        isOpen={isReportCardModalOpen}
        onClose={() => {
          setIsReportCardModalOpen(false);
          setSelectedReportCardStudent(null);
        }}
        student={selectedReportCardStudent}
        trimester={selectedGradeTrimester}
        academicYear={config.currentAcademicYear}
        grades={grades}
        reportCards={reportCards}
        config={config}
        onSave={handleSaveReportCard}
      />
      </div>
    </ErrorBoundary>
  );
}

function ReminderModal({ isOpen, onClose, students, config, initialType = 'overdue' }: {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  config: SchoolConfig;
  initialType?: 'upcoming' | 'overdue';
}) {
  const [isSending, setIsSending] = useState(false);
  const [reminderType, setReminderType] = useState<'upcoming' | 'overdue'>(initialType);
  const [messagePreview, setMessagePreview] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (isOpen) {
      setReminderType(initialType);
    }
  }, [isOpen, initialType]);

  const overdueStudents = useMemo(() => {
    return students.filter(s => {
      const status = getStudentPaymentStatus(s, config);
      return status === 'Overdue';
    });
  }, [students, config]);

  const upcomingStudents = useMemo(() => {
    const threshold = config.reminderThreshold || 7;
    return students.filter(s => {
      const status = getStudentPaymentStatus(s, config);
      if (status === 'Paid') return false;
      
      // Check if deadline is within threshold days
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const [day1, month1, year1] = config.tranche1Deadline.split('/').map(Number);
      const [day2, month2, year2] = config.tranche2Deadline.split('/').map(Number);
      const tr1Deadline = new Date(year1, month1 - 1, day1);
      const tr2Deadline = new Date(year2, month2 - 1, day2);
      
      const diff1 = (tr1Deadline.getTime() - now.getTime()) / (1000 * 3600 * 24);
      const diff2 = (tr2Deadline.getTime() - now.getTime()) / (1000 * 3600 * 24);
      
      return (diff1 > 0 && diff1 <= threshold && s.remainingTr1 > 0) || 
             (diff2 > 0 && diff2 <= threshold && s.remainingTr2 > 0);
    });
  }, [students, config]);

  const targetStudents = reminderType === 'overdue' ? overdueStudents : upcomingStudents;

  useEffect(() => {
    setSelectedStudents(targetStudents);
  }, [targetStudents]);

  const generatePreview = async () => {
    if (targetStudents.length === 0) return;
    
    if (config.whatsappTemplate) {
      setMessagePreview(config.whatsappTemplate);
      return;
    }
    
    setIsSending(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `Génère un message de rappel de paiement court et professionnel pour une école. 
      Le type de rappel est : ${reminderType === 'overdue' ? 'Paiement en retard' : 'Paiement à venir'}.
      Le message doit être poli mais ferme, mentionnant que l'éducation de l'enfant est la priorité.
      Utilise des variables comme [NOM_ELEVE] et [MONTANT_RESTANT].
      Réponds uniquement avec le texte du message en français.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setMessagePreview(response.text || "Cher parent, nous vous rappelons que le paiement de la scolarité de [NOM_ELEVE] est attendu. Montant restant: [MONTANT_RESTANT] FCFA. Merci de régulariser au plus vite.");
    } catch (error) {
      console.error("Error generating preview:", error);
      setMessagePreview("Cher parent, nous vous rappelons que le paiement de la scolarité de [NOM_ELEVE] est attendu. Montant restant: [MONTANT_RESTANT] FCFA. Merci de régulariser au plus vite.");
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      generatePreview();
    }
  }, [isOpen, reminderType]);

  const handleSend = async () => {
    if (selectedStudents.length === 0) return;
    
    setIsSending(true);
    
    // For bulk sending, we open the first one and provide a way to continue if needed
    // But usually, browser blocks multiple popups. 
    // We'll open the first one and alert the user.
    
    const s = selectedStudents[0];
    const deadline = s.remainingTr1 > 0 ? config.tranche1Deadline : config.tranche2Deadline;
    
    const message = messagePreview
      .replace(/\[NOM_ELEVE\]/g, s.name)
      .replace(/\[MONTANT_RESTANT\]/g, s.totalRemaining.toLocaleString())
      .replace(/\[DATE_LIMITE\]/g, deadline || '');
    
    sendWhatsAppMessage(s.phone || '', message);
    
    if (selectedStudents.length > 1) {
      alert(`Le premier rappel a été ouvert. Pour les ${selectedStudents.length - 1} autres, veuillez utiliser les boutons individuels dans la liste pour éviter le blocage des fenêtres surgissantes par votre navigateur.`);
    }
    
    setIsSending(false);
    // We don't close the modal automatically if there are more students
    if (selectedStudents.length === 1) onClose();
  };

  const handleSendSMSBulk = async () => {
    if (selectedStudents.length === 0) return;
    
    setIsSending(true);
    
    let successCount = 0;
    let errorCount = 0;

    for (const s of selectedStudents) {
      if (!s.phone) {
        errorCount++;
        continue;
      }
      const deadline = s.remainingTr1 > 0 ? config.tranche1Deadline : config.tranche2Deadline;
      
      const message = messagePreview
        .replace(/\[NOM_ELEVE\]/g, s.name)
        .replace(/\[MONTANT_RESTANT\]/g, s.totalRemaining.toLocaleString())
        .replace(/\[DATE_LIMITE\]/g, deadline || '');
      
      try {
        let finalPhone = s.phone.replace(/\D/g, '');
        if (finalPhone.length === 9 && finalPhone.startsWith('6')) {
          finalPhone = '+237' + finalPhone;
        } else if (!finalPhone.startsWith('+')) {
          finalPhone = '+' + finalPhone;
        }

        const response = await fetch('/api/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: finalPhone, message }),
        });
        const data = await response.json();
        if (data.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }
    
    alert(`Envoi terminé. ${successCount} SMS envoyés avec succès, ${errorCount} erreurs.`);
    
    setIsSending(false);
    onClose();
  };

  const handleSendIndividual = (s: Student) => {
    const deadline = s.remainingTr1 > 0 ? config.tranche1Deadline : config.tranche2Deadline;
    
    const message = messagePreview
      .replace(/\[NOM_ELEVE\]/g, s.name)
      .replace(/\[MONTANT_RESTANT\]/g, s.totalRemaining.toLocaleString())
      .replace(/\[DATE_LIMITE\]/g, deadline || '');
    sendWhatsAppMessage(s.phone || '', message);
  };

  const handleSendIndividualSMS = (s: Student) => {
    const deadline = s.remainingTr1 > 0 ? config.tranche1Deadline : config.tranche2Deadline;
    
    const message = messagePreview
      .replace(/\[NOM_ELEVE\]/g, s.name)
      .replace(/\[MONTANT_RESTANT\]/g, s.totalRemaining.toLocaleString())
      .replace(/\[DATE_LIMITE\]/g, deadline || '');
    sendSMSMessage(s.phone || '', message);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Rappels Automatisés</h3>
            <p className="text-slate-500 text-sm mt-1">Envoyez des notifications aux parents</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all shadow-sm">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto">
          <div className="flex p-1 bg-slate-100 rounded-2xl w-fit">
            <button 
              onClick={() => setReminderType('overdue')}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${reminderType === 'overdue' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              En retard ({overdueStudents.length})
            </button>
            <button 
              onClick={() => setReminderType('upcoming')}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${reminderType === 'upcoming' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              À venir ({upcomingStudents.length})
            </button>
          </div>

          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Aperçu du message (IA)
            </h4>
            {isSending && !messagePreview ? (
              <div className="h-24 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="bg-white p-4 rounded-2xl border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap italic">
                "{messagePreview}"
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-3 italic">
              * Les variables [NOM_ELEVE] et [MONTANT_RESTANT] seront remplacées automatiquement pour chaque parent.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
              Destinataires ({selectedStudents.length})
              <button 
                onClick={() => setSelectedStudents(selectedStudents.length === targetStudents.length ? [] : targetStudents)}
                className="text-xs text-blue-600 hover:underline"
              >
                {selectedStudents.length === targetStudents.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
              {targetStudents.map(s => (
                <label key={s.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${selectedStudents.find(sel => sel.id === s.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                  <input 
                    type="checkbox"
                    checked={!!selectedStudents.find(sel => sel.id === s.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStudents([...selectedStudents, s]);
                      } else {
                        setSelectedStudents(selectedStudents.filter(sel => sel.id !== s.id));
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-700 truncate">{s.fullName || s.name}</p>
                    <p className="text-[10px] text-slate-500">{s.class} • Reste: {s.totalRemaining.toLocaleString()} FCFA</p>
                  </div>
                  {s.phone && (
                    <div className="flex gap-1">
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSendIndividual(s);
                        }}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                        title="Envoyer via WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSendIndividualSMS(s);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        title="Envoyer via SMS"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </label>
              ))}
              {targetStudents.length === 0 && (
                <div className="col-span-full py-8 text-center text-slate-400 italic text-sm">
                  Aucun élève trouvé pour ce type de rappel.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-4 bg-white text-slate-600 font-bold rounded-2xl border border-slate-200 hover:bg-slate-100 transition-all"
          >
            Annuler
          </button>
          <button 
            onClick={handleSend}
            disabled={isSending || selectedStudents.length === 0}
            className="flex-[2] px-6 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {isSending ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <MessageCircle className="w-5 h-5" />
                WhatsApp ({selectedStudents.length})
              </>
            )}
          </button>
          <button 
            onClick={handleSendSMSBulk}
            disabled={isSending || selectedStudents.length === 0}
            className="flex-[2] px-6 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {isSending ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <MessageSquare className="w-5 h-5" />
                SMS ({selectedStudents.length})
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ConfirmModal({ isOpen, onClose, onConfirm, title, message }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void;
  title: string;
  message: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-slate-600 leading-relaxed">{message}</p>
        </div>
        <div className="p-6 pt-0 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Annuler
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors"
          >
            Confirmer
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DiscountModal({ isOpen, onClose, onAdd }: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (discount: { name: string, type: 'percentage' | 'amount', value: number }) => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'percentage' as 'percentage' | 'amount',
    value: 0
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">Ajouter une réduction</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form className="p-6 space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!formData.name || formData.value <= 0) return;
          onAdd(formData);
          setFormData({ name: '', type: 'percentage', value: 0 });
        }}>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Nom de la réduction *</label>
            <input 
              required
              type="text" 
              placeholder="ex: Fratrie"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Type de réduction *</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value as 'percentage' | 'amount'})}
            >
              <option value="percentage">Pourcentage (%)</option>
              <option value="amount">Montant fixe (FCFA)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Valeur *</label>
            <input 
              required
              type="number" 
              min="1"
              step="any"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.value || ''}
              onChange={(e) => setFormData({...formData, value: parseFloat(e.target.value) || 0})}
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-slate-500 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Ajouter
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function PaymentModal({ isOpen, onClose, onAdd, student, isSubmitting, config }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAdd: (payment: { amount: number, type: 'inscription' | 'tranche1' | 'tranche2', date: string }) => void;
  student: Student;
  isSubmitting: boolean;
  config: SchoolConfig;
}) {
  const [formData, setFormData] = useState({
    amount: 0,
    type: 'tranche1' as 'inscription' | 'tranche1' | 'tranche2',
    date: new Date().toLocaleDateString('fr-FR')
  });

  if (!isOpen) return null;

  const getMaxAmount = () => {
    if (formData.type === 'inscription') return Math.max(0, config.registrationFee - student.regFee);
    if (formData.type === 'tranche1') return student.remainingTr1;
    if (formData.type === 'tranche2') return student.remainingTr2;
    return 0;
  };

  const maxAmount = getMaxAmount();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">Ajouter un paiement</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form className="p-6 space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (formData.amount > maxAmount) {
            alert(`Le montant ne peut pas dépasser le reste à payer (${maxAmount.toLocaleString()} FCFA)`);
            return;
          }
          onAdd(formData);
        }}>
          <div className="p-4 bg-blue-50 text-blue-800 rounded-xl mb-4">
            <p className="font-semibold">{student.name}</p>
            <p className="text-sm opacity-80">Classe: {student.class}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Type de paiement</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value as any, amount: 0})}
            >
              <option value="inscription">Inscription (Reste: {(config.registrationFee - student.regFee).toLocaleString()})</option>
              <option value="tranche1">Tranche 1 (Reste: {student.remainingTr1.toLocaleString()})</option>
              <option value="tranche2">Tranche 2 (Reste: {student.remainingTr2.toLocaleString()})</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Montant (FCFA) - Max: {maxAmount.toLocaleString()}</label>
            <input 
              required
              type="number" 
              max={maxAmount}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.amount}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                setFormData({...formData, amount: val});
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Date</label>
            <input 
              required
              type="text" 
              placeholder="JJ/MM/AAAA"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl transition-colors ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ExpenseModal({ isOpen, onClose, onAdd, isSubmitting, expense, defaultType, teachers = [] }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAdd: (expense: any) => void;
  isSubmitting: boolean;
  expense?: Expense | null;
  defaultType?: Expense['type'];
  teachers?: AppUser[];
}) {
  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    type: (defaultType || 'fonctionnement') as Expense['type'],
    date: new Date().toLocaleDateString('fr-FR'),
    teacherId: ''
  });

  useEffect(() => {
    if (expense) {
      setFormData({
        description: expense.description,
        amount: expense.amount,
        type: expense.type,
        date: expense.date || new Date().toLocaleDateString('fr-FR'),
        teacherId: expense.teacherId || ''
      });
    } else {
      setFormData({
        description: '',
        amount: 0,
        type: (defaultType || 'fonctionnement') as Expense['type'],
        date: new Date().toLocaleDateString('fr-FR'),
        teacherId: ''
      });
    }
  }, [expense, isOpen, defaultType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">{expense ? 'Modifier la dépense' : 'Nouvelle Dépense'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form className="p-6 space-y-4" onSubmit={(e) => {
          e.preventDefault();
          onAdd(formData);
        }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Type</label>
              <select 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as Expense['type']})}
              >
                <option value="fonctionnement">Fonctionnement</option>
                <option value="salaire">Salaire</option>
                <option value="travaux">Travaux</option>
                <option value="banque">Banque</option>
                <option value="cotisation">Cotisation Enseignant</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Date</label>
              <input 
                required
                type="text" 
                placeholder="JJ/MM/AAAA"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          {(formData.type === 'salaire' || formData.type === 'cotisation') && teachers.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Enseignant (Optionnel)</label>
              <select 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.teacherId}
                onChange={(e) => {
                  const teacherId = e.target.value;
                  const teacher = teachers.find(t => t.id === teacherId);
                  setFormData({
                    ...formData, 
                    teacherId,
                    description: teacher ? `${formData.type === 'salaire' ? 'Salaire' : 'Cotisation'} - ${teacher.name || teacher.email}` : formData.description
                  });
                }}
              >
                <option value="">Sélectionner un enseignant...</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name || t.email}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Description</label>
            <input 
              required
              type="text" 
              placeholder="Ex: Facture électricité, Salaire Mars..."
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Montant (FCFA)</label>
            <input 
              required
              type="number" 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xl font-bold text-slate-800"
              value={formData.amount || ''}
              onChange={(e) => setFormData({...formData, amount: e.target.value === '' ? 0 : parseInt(e.target.value)})}
            />
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 bg-rose-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/20 transition-all ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-700'}`}
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer la dépense'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function GradeModal({ isOpen, onClose, student, subject, trimester, academicYear, grade, onSave }: { 
  isOpen: boolean, 
  onClose: () => void, 
  student: Student | null,
  subject: any,
  trimester: number,
  academicYear: string,
  grade: Grade | null,
  onSave: (grade: Grade) => Promise<void>
}) {
  const [formData, setFormData] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(grade || {
        studentId: student?.id || '',
        subjectId: subject?.id || '',
        trimester,
        academicYear,
        evaluations: {
          ecrit: [
            { note: '', coefficient: 1 },
            { note: '', coefficient: 1 },
            { note: '', coefficient: 1 }
          ],
          oral: [''],
          s_etre: [''],
          tp: ['']
        },
        cote: '',
        observation: ''
      });
    }
  }, [isOpen, grade, student, subject, trimester, academicYear]);

  if (!isOpen || !formData) return null;

  const handleEvaluationChange = (type: 'ecrit' | 'oral' | 's_etre' | 'tp', index: number, value: string, field: 'note' | 'coefficient' = 'note') => {
    const newEvaluations = { ...formData.evaluations };
    if (type === 'ecrit') {
      const current = newEvaluations.ecrit[index];
      newEvaluations.ecrit[index] = {
        ...current,
        [field]: field === 'coefficient' ? Number(value) : value
      };
    } else {
      newEvaluations[type][index] = value;
    }
    setFormData({ ...formData, evaluations: newEvaluations });
  };

  const addEvaluation = (type: 'ecrit' | 'oral' | 's_etre' | 'tp') => {
    const newEvaluations = { ...formData.evaluations };
    if (type === 'ecrit') {
      newEvaluations.ecrit = [...newEvaluations.ecrit, { note: '', coefficient: 1 }];
    } else {
      newEvaluations[type] = [...newEvaluations[type], ''];
    }
    setFormData({ ...formData, evaluations: newEvaluations });
  };

  const removeEvaluation = (type: 'ecrit' | 'oral' | 's_etre' | 'tp', index: number) => {
    const newEvaluations = { ...formData.evaluations };
    newEvaluations[type] = newEvaluations[type].filter((_: any, i: number) => i !== index);
    setFormData({ ...formData, evaluations: newEvaluations });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Saisie des notes</h2>
            <p className="text-sm text-slate-500">{student?.name} - {subject?.name} - Trimestre {trimester}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {/* Écrit, Oral, S. Être, TP */}
          <div className="space-y-6">
            {[
              { id: 'ecrit', label: 'Évaluations Écrites', icon: Edit2, color: 'text-blue-600' },
              { id: 'oral', label: 'Évaluations Orales', icon: MessageSquare, color: 'text-emerald-600' },
              { id: 's_etre', label: 'Savoir-être', icon: Heart, color: 'text-rose-600' },
              { id: 'tp', label: 'Travaux Pratiques (TP)', icon: FlaskConical, color: 'text-amber-600' }
            ].map((type) => (
              <div key={type.id} className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <type.icon className={`w-4 h-4 ${type.color}`} />
                    {type.label}
                  </h3>
                  <button 
                    onClick={() => addEvaluation(type.id as any)}
                    className={`text-xs font-bold ${type.color} hover:opacity-80 flex items-center gap-1`}
                  >
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {formData.evaluations[type.id].map((val: any, i: number) => (
                    <div key={i} className="relative group bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {type.label} {i + 1}
                        </span>
                        {formData.evaluations[type.id].length > 1 && (
                          <button 
                            onClick={() => removeEvaluation(type.id as any, i)}
                            className="text-rose-500 hover:text-rose-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Note</label>
                          {student && ['PS', 'MS', 'GS'].includes(student.class) ? (
                            <select
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                              value={type.id === 'ecrit' ? val.note : val}
                              onChange={(e) => handleEvaluationChange(type.id as any, i, e.target.value, 'note')}
                            >
                              <option value="">-</option>
                              <option value="A+">A+</option>
                              <option value="A">A</option>
                              <option value="B+">B+</option>
                              <option value="B">B</option>
                              <option value="C">C</option>
                              <option value="D">D</option>
                            </select>
                          ) : (
                            <input 
                              type={type.id === 'ecrit' ? "number" : "text"}
                              step={type.id === 'ecrit' ? "0.25" : undefined}
                              min={type.id === 'ecrit' ? "0" : undefined}
                              max={type.id === 'ecrit' ? "20" : undefined}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                              value={type.id === 'ecrit' ? val.note : val}
                              onChange={(e) => handleEvaluationChange(type.id as any, i, e.target.value, 'note')}
                              placeholder="Note"
                            />
                          )}
                        </div>
                        
                        {type.id === 'ecrit' && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Coefficient</label>
                            <input 
                              type="number"
                              min="1"
                              max="10"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                              value={val.coefficient}
                              onChange={(e) => handleEvaluationChange('ecrit', i, e.target.value, 'coefficient')}
                              placeholder="Coeff"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800">Cote globale</h3>
              <input 
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                value={formData.cote}
                onChange={(e) => setFormData({ ...formData, cote: e.target.value })}
                placeholder="Ex: A, B+, Exc..."
              />
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800">Observation</h3>
              <input 
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                value={formData.observation}
                onChange={(e) => setFormData({ ...formData, observation: e.target.value })}
                placeholder="Commentaire de l'enseignant"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
          >
            Annuler
          </button>
          <button 
            onClick={async () => {
              await onSave(formData);
              onClose();
            }}
            className="flex-1 py-3 px-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            Enregistrer
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RegistrationModal({ isOpen, onClose, onAdd, classes, isSubmitting, config, student, isAdmin, canWrite }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAdd: (student: any) => void;
  classes: string[];
  isSubmitting: boolean;
  config: SchoolConfig;
  student?: Student | null;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    class: classes[0] || 'CE1',
    gender: 'G',
    status: 'N',
    dob: '',
    pob: '',
    phone: '',
    regFee: 5000,
    tranche1: 0,
    tranche2: 0,
    tranche1Deadline: '',
    tranche2Deadline: '',
    discount: 0,
    discountId: '', // Track selected discount ID
    regDate: new Date().toLocaleDateString('fr-FR')
  });

  useEffect(() => {
    if (student) {
      const isMaternelle = student.class === 'GS' || student.class === 'PS' || student.class.toLowerCase().includes('maternelle');
      const baseTr2 = isMaternelle ? (config.tranche2FeeMaternelle || 20000) : config.tranche2Fee;
      const totalFees = config.tranche1Fee + baseTr2;
      const matchingDiscount = config.discounts?.find(d => {
        const amount = d.type === 'percentage' ? (totalFees * d.value) / 100 : d.value;
        return Math.abs(amount - (student.discount || 0)) < 1;
      });

      setFormData({
        name: student.name,
        class: student.class,
        gender: student.gender,
        status: student.status,
        dob: student.dob || '',
        pob: student.pob || '',
        phone: student.phone || '',
        email: student.email || '',
        regFee: student.regFee,
        tranche1: student.tranche1,
        tranche2: student.tranche2,
        tranche1Deadline: student.tranche1Deadline || '',
        tranche2Deadline: student.tranche2Deadline || '',
        discount: student.discount || 0,
        discountId: matchingDiscount?.id || (student.discount ? 'custom' : ''),
        regDate: student.regDate
      });
    } else {
      setFormData({
        name: '',
        class: classes[0] || 'CE1',
        gender: 'G',
        status: 'N',
        dob: '',
        pob: '',
        phone: '',
        email: '',
        regFee: 5000,
        tranche1: 0,
        tranche2: 0,
        tranche1Deadline: '',
        tranche2Deadline: '',
        discount: 0,
        discountId: '',
        regDate: new Date().toLocaleDateString('fr-FR')
      });
    }
  }, [student, isOpen, classes]);

  // Recalculate discount and cap tranches when class or discount selection changes
  useEffect(() => {
    if (!isOpen) return;

    const selectedDiscount = config.discounts?.find(d => d.id === formData.discountId);
    let newDiscount = formData.discount;

    if (selectedDiscount) {
      if (selectedDiscount.type === 'amount') {
        newDiscount = selectedDiscount.value;
      } else {
        const isMaternelle = formData.class === 'GS' || formData.class === 'PS' || formData.class.toLowerCase().includes('maternelle');
        const baseTr2 = isMaternelle ? (config.tranche2FeeMaternelle || 20000) : config.tranche2Fee;
        const totalFees = config.tranche1Fee + baseTr2;
        newDiscount = (totalFees * selectedDiscount.value) / 100;
      }
    }

    const { expectedTr1, expectedTr2 } = calculateExpectedTranches(formData.class, config, newDiscount);

    setFormData(prev => ({
      ...prev,
      discount: newDiscount,
      tranche1: Math.min(prev.tranche1, expectedTr1),
      tranche2: Math.min(prev.tranche2, expectedTr2)
    }));
  }, [formData.class, formData.discountId, config, isOpen]);

  const { expectedTr1, expectedTr2 } = calculateExpectedTranches(formData.class, config, formData.discount);

  useEffect(() => {
    if (formData.tranche1 > expectedTr1) {
      setFormData(prev => ({ ...prev, tranche1: expectedTr1 }));
    }
    if (formData.tranche2 > expectedTr2) {
      setFormData(prev => ({ ...prev, tranche2: expectedTr2 }));
    }
  }, [expectedTr1, expectedTr2]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">{student ? 'Modifier l\'élève' : 'Nouvelle Inscription'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form className="p-6 space-y-4 overflow-y-auto max-h-[75vh]" onSubmit={(e) => {
          e.preventDefault();
          if (formData.regFee > config.registrationFee) {
            alert(`Les frais d'inscription ne peuvent pas dépasser ${config.registrationFee.toLocaleString()} FCFA`);
            return;
          }
          if (formData.tranche1 > expectedTr1) {
            alert(`La tranche 1 ne peut pas dépasser ${expectedTr1.toLocaleString()} FCFA (après réduction)`);
            return;
          }
          if (formData.tranche2 > expectedTr2) {
            alert(`La tranche 2 ne peut pas dépasser ${expectedTr2.toLocaleString()} FCFA (après réduction)`);
            return;
          }
          onAdd(formData);
        }}>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Nom complet *</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Sexe *</label>
              <select 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.gender}
                onChange={(e) => setFormData({...formData, gender: e.target.value})}
              >
                <option value="G">Garçon</option>
                <option value="F">Fille</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Statut *</label>
              <select 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
              >
                <option value="N">Nouveau</option>
                <option value="A">Ancien</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Date de naissance</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.dob}
                onChange={(e) => setFormData({...formData, dob: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Lieu de naissance</label>
              <input 
                type="text" 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.pob}
                onChange={(e) => setFormData({...formData, pob: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Téléphone des parents</label>
            <input 
              type="tel" 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Email des parents</label>
            <input 
              type="email" 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Classe *</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.class}
              onChange={(e) => setFormData({...formData, class: e.target.value})}
            >
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Frais d'inscription (Max: {config.registrationFee.toLocaleString()})</label>
              <input 
                type="number" 
                max={config.registrationFee}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                value={formData.regFee}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                  setFormData({...formData, regFee: val});
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Réduction</label>
              <div className="flex gap-2">
                <select
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                  value={formData.discountId}
                  onChange={(e) => setFormData({...formData, discountId: e.target.value})}
                >
                  <option value="">Aucune réduction</option>
                  {(config.discounts || []).map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.type === 'percentage' ? `${d.value}%` : `${d.value.toLocaleString()} FCFA`})
                    </option>
                  ))}
                  <option value="custom">Personnalisée...</option>
                </select>
                <input 
                  type="number" 
                  disabled={!canWrite || (formData.discountId !== '' && formData.discountId !== 'custom')}
                  placeholder="Montant"
                  className="w-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                  value={formData.discount || ''}
                  onChange={(e) => setFormData({...formData, discount: e.target.value === '' ? 0 : parseInt(e.target.value), discountId: 'custom'})}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Tranche 1 (Max: {expectedTr1.toLocaleString()})</label>
              <input 
                type="number" 
                max={expectedTr1}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                value={formData.tranche1}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                  setFormData({...formData, tranche1: val});
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Tranche 2 (Max: {expectedTr2.toLocaleString()})</label>
              <input 
                type="number" 
                max={expectedTr2}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                value={formData.tranche2}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                  setFormData({...formData, tranche2: val});
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Échéance T1 (Optionnel)</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.tranche1Deadline ? formData.tranche1Deadline.split('/').reverse().join('-') : ''}
                onChange={(e) => {
                  const dateVal = e.target.value;
                  const formatted = dateVal ? dateVal.split('-').reverse().join('/') : '';
                  setFormData({...formData, tranche1Deadline: formatted});
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Échéance T2 (Optionnel)</label>
              <input 
                type="date" 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={formData.tranche2Deadline ? formData.tranche2Deadline.split('/').reverse().join('-') : ''}
                onChange={(e) => {
                  const dateVal = e.target.value;
                  const formatted = dateVal ? dateVal.split('-').reverse().join('/') : '';
                  setFormData({...formData, tranche2Deadline: formatted});
                }}
              />
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
            >
              {isSubmitting ? 'Enregistrement...' : (student ? 'Mettre à jour' : 'Inscrire l\'élève')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-primary/10 text-primary font-semibold' 
          : 'text-card-foreground/60 hover:bg-accent hover:text-card-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="activeNav" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </button>
  );
}

function StatCard({ title, value, icon, color, onClick, actionIcon }: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode; 
  color: string;
  onClick?: () => void;
  actionIcon?: React.ReactNode;
}) {
  return (
    <div 
      className={`bg-card p-6 rounded-2xl shadow-sm border border-border flex items-start justify-between group transition-all ${onClick ? 'cursor-pointer hover:border-primary/40 hover:shadow-md' : 'hover:border-primary/20'}`}
      onClick={onClick}
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-card-foreground/40 mb-1 flex items-center gap-2">
          {title}
          {actionIcon && <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">{actionIcon}</span>}
        </p>
        <p className="text-2xl font-bold text-card-foreground">{value}</p>
      </div>
      <div className={`${color} p-3 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
    </div>
  );
}

function ReceiptModal({ isOpen, onClose, payment, student, onDownloadPDF, config }: { 
  isOpen: boolean; 
  onClose: () => void; 
  payment: Payment | null; 
  student: Student | null;
  onDownloadPDF: (payment: Payment) => void;
  config: SchoolConfig;
}) {
  const componentRef = React.useRef<HTMLDivElement>(null);
  const [isSending, setIsSending] = React.useState(false);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: payment ? `Recu_${payment.studentName.replace(/\s+/g, '_')}_${payment.date.replace(/\//g, '-')}` : 'Recu',
  });

  const handleSendEmail = async () => {
    if (!payment || !student?.email) {
      alert("L'élève n'a pas d'adresse email configurée.");
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/send-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: student.email,
          studentName: student.name,
          paymentId: payment.id,
          amount: payment.amount,
          date: payment.date,
          type: payment.type,
          academicYear: payment.academicYear
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert("Reçu envoyé avec succès par email !");
      } else {
        throw new Error(result.error || "Erreur lors de l'envoi");
      }
    } catch (error) {
      console.error("Email error:", error);
      alert("Échec de l'envoi de l'email. Veuillez vérifier la configuration SMTP.");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen || !payment || !student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm print:static print:bg-white print:p-0 print:block">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden print:shadow-none print:rounded-none print:max-w-none print:w-full print:h-full print:max-h-none"
      >
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden shrink-0">
          <div className="flex justify-between items-center w-full sm:w-auto">
            <h3 className="text-xl font-bold text-slate-800">Reçu de Paiement</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors sm:hidden">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <button 
              onClick={handleSendEmail}
              disabled={isSending || !student?.email}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!student?.email ? "Aucun email configuré pour cet élève" : "Envoyer par email"}
            >
              <Mail className={`w-4 h-4 ${isSending ? 'animate-pulse' : ''}`} />
              {isSending ? 'Envoi...' : 'Email'}
            </button>
            {student?.phone && (
              <button 
                onClick={() => {
                  const typeLabel = payment.type === 'inscription' ? 'Frais d\'inscription' : 
                                   payment.type === 'tranche1' ? 'Tranche 1' : 'Tranche 2';
                  const message = `REÇU DE PAIEMENT\n\nÉcole: ${config.schoolName || "GSBCK GESTION"}\nÉlève: ${student.name}\nClasse: ${student.class}\n\nPaiement: ${typeLabel}\nMontant: ${payment.amount.toLocaleString()} FCFA\nDate: ${payment.date}\n\nMerci pour votre paiement.\n\n${config.schoolName || "GSBCK GESTION"}`;
                  sendWhatsAppMessage(student.phone, message);
                }}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
                title="Envoyer par WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
            )}
            <button 
              onClick={() => onDownloadPDF(payment)}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button 
              onClick={() => handlePrint()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
            <button onClick={onClose} className="hidden sm:block p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 print:p-12 bg-white overflow-y-auto print:overflow-visible" id="receipt-content" ref={componentRef}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-800 pb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {config.schoolLogo && (
                <img src={config.schoolLogo} alt="School Logo" className="w-16 h-16 object-contain" />
              )}
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase">{config.schoolName || "GSBCK GESTION"}</h2>
                <p className="text-sm font-bold text-slate-600">{config.schoolAddress || "Complexe Scolaire Bilingue"}</p>
                <p className="text-xs text-slate-500 italic">L'excellence au service de l'éducation</p>
                <p className="text-xs text-slate-500">{config.schoolPhone || "+237 6XX XX XX XX"}</p>
                {config.schoolEmail && <p className="text-xs text-slate-500">{config.schoolEmail}</p>}
              </div>
            </div>
            <div className="text-left sm:text-right space-y-1 w-full sm:w-auto bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl sm:rounded-none mt-4 sm:mt-0">
              <p className="text-sm font-bold text-slate-800">Reçu N°: {payment.id.toUpperCase()}</p>
              <p className="text-sm text-slate-600">Date: {payment.date}</p>
              <p className="text-sm text-slate-600">Année: {payment.academicYear}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 py-4">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Élève</p>
                <p className="text-lg font-bold text-slate-800">{payment.studentName}</p>
                <p className="text-sm text-slate-600">Classe: {student.class}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Type de Paiement</p>
                <p className="text-sm font-bold text-slate-700 capitalize">{payment.type.replace('tranche', 'Tranche ')}</p>
              </div>
            </div>
            <div className="text-left sm:text-right space-y-4 border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Montant Versé</p>
                <p className="text-3xl font-black text-blue-600">{payment.amount.toLocaleString()} FCFA</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reste à Payer</p>
                <p className="text-lg font-bold text-rose-500">
                  {payment.type === 'inscription' ? '0' : 
                   payment.type === 'tranche1' ? student.remainingTr1.toLocaleString() : 
                   student.remainingTr2.toLocaleString()} FCFA
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-100 print:bg-transparent print:border-slate-800">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 border-b border-slate-200 pb-2">
              <span className="text-sm font-bold text-slate-600">Total Scolarité Restant</span>
              <span className="text-lg font-black text-slate-800">{student.totalRemaining.toLocaleString()} FCFA</span>
            </div>
            <p className="text-[10px] text-slate-400 italic text-center">
              Ce reçu est une preuve officielle de votre paiement. Veuillez le conserver précieusement.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-between gap-8 pt-8 sm:pt-12">
            <div className="text-center w-full sm:w-48">
              <p className="text-xs font-bold text-slate-400 uppercase mb-8 sm:mb-12">Signature Parent</p>
              <div className="border-t border-slate-300 mx-8 sm:mx-0"></div>
            </div>
            <div className="text-center w-full sm:w-48">
              <p className="text-xs font-bold text-slate-400 uppercase mb-8 sm:mb-12">Cachet & Signature</p>
              <div className="border-t border-slate-300 mx-8 sm:mx-0"></div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 print:hidden">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white text-slate-600 font-bold rounded-2xl border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            Fermer
          </button>
          <button 
            onClick={handlePrint}
            className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Imprimer le reçu
          </button>
        </div>
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-content, #receipt-content * {
            visibility: visible;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}} />
    </div>
  );
}

function ExcelImportModal({ isOpen, onClose, onImport, config }: {
  isOpen: boolean;
  onClose: () => void;
  onImport: (parsedData: any[]) => Promise<void>;
  config: SchoolConfig;
}) {
  const [pasteData, setPasteData] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!pasteData) {
      setParsedData([]);
      return;
    }

    const lines = pasteData.trim().split('\n');
    const data = lines.map(line => line.split('\t'));
    
    // Filter out header if it exists
    const filteredData = data.filter(row => {
      const firstCell = row[0]?.toLowerCase() || '';
      return !firstCell.includes('nom') && !firstCell.includes('prénom');
    });

    setParsedData(filteredData);
  }, [pasteData]);

  if (!isOpen) return null;

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setIsProcessing(true);
    try {
      await onImport(parsedData);
      setPasteData('');
      onClose();
    } catch (error) {
      console.error('Import error:', error);
      alert('Erreur lors de l\'importation. Vérifiez le format des données.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <FileUp className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Importer des élèves depuis Excel</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
            <h4 className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Instructions
            </h4>
            <p className="text-xs text-indigo-700 leading-relaxed">
              1. Dans votre fichier Excel, sélectionnez les colonnes dans cet ordre :<br />
              <span className="font-mono font-bold">Nom, Classe, Date Naiss., Lieu Naiss., Sexe, Tél, Statut (N/A), Date Inscr., Montant Inscr., Tranche 1, Tranche 2</span><br />
              2. Copiez les lignes (Ctrl+C).<br />
              3. Collez-les dans la zone ci-dessous (Ctrl+V).
            </p>
          </div>

          <div className="space-y-2">
            <textarea 
              className="w-full h-40 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono text-sm"
              placeholder="Collez les données Excel ici..."
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
            />
          </div>

          {parsedData.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Aperçu ({parsedData.length} élèves détectés)</label>
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-2">Nom</th>
                      <th className="px-4 py-2">Classe</th>
                      <th className="px-4 py-2">Sexe</th>
                      <th className="px-4 py-2">Statut</th>
                      <th className="px-4 py-2 text-right">Inscr.</th>
                      <th className="px-4 py-2 text-right">Tr1</th>
                      <th className="px-4 py-2 text-right">Tr2</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {parsedData.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 font-medium">{row[0]}</td>
                        <td className="px-4 py-2">{row[1]}</td>
                        <td className="px-4 py-2">{row[4]}</td>
                        <td className="px-4 py-2">{row[6]}</td>
                        <td className="px-4 py-2 text-right">{row[8]}</td>
                        <td className="px-4 py-2 text-right">{row[9]}</td>
                        <td className="px-4 py-2 text-right">{row[10]}</td>
                      </tr>
                    ))}
                    {parsedData.length > 5 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-2 text-center text-slate-400 italic">
                          ... et {parsedData.length - 5} autres élèves
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-slate-500 font-semibold hover:bg-slate-100 rounded-xl transition-colors"
          >
            Annuler
          </button>
          <button 
            onClick={handleImport}
            disabled={parsedData.length === 0 || isProcessing}
            className="px-8 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importation...
              </>
            ) : (
              <>
                <FileUp className="w-4 h-4" />
                Lancer l'importation
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
