import React, { createContext, useContext, useState, useEffect } from 'react';
import { Student, Result, TimetableEntry, Notification, Memo } from '../types';

interface AppContextType {
  students: Student[];
  timetable: TimetableEntry[];
  notifications: Notification[];
  memos: Memo[];
  addStudent: (student: Omit<Student, 'id' | 'results'>) => void;
  addResult: (result: Omit<Result, 'id'>) => void;
  addTimetableEntry: (entry: Omit<TimetableEntry, 'id'>) => void;
  updateTimetableEntry: (id: string, entry: Partial<TimetableEntry>) => void;
  deleteTimetableEntry: (id: string) => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  markNotificationRead: (id: string) => void;
  addMemo: (memo: Omit<Memo, 'id'>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Mock data
const mockStudents: Student[] = [
  {
    id: '1',
    name: 'Alice Johnson',
    email: 'alice@student.com',
    class: '10-A',
    rollNumber: '001',
    avatar: 'https://images.pexels.com/photos/3866555/pexels-photo-3866555.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    results: []
  },
  {
    id: '2',
    name: 'Bob Smith',
    email: 'bob@student.com',
    class: '10-A',
    rollNumber: '002',
    avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    results: []
  },
  {
    id: '3',
    name: 'Carol Davis',
    email: 'carol@student.com',
    class: '10-B',
    rollNumber: '003',
    avatar: 'https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    results: []
  }
];

const mockTimetable: TimetableEntry[] = [
  {
    id: '1',
    day: 'Monday',
    time: '9:00 AM',
    subject: 'Mathematics',
    teacher: 'Sarah Teacher',
    class: '10-A',
    room: 'Room 101'
  },
  {
    id: '2',
    day: 'Monday',
    time: '10:00 AM',
    subject: 'Physics',
    teacher: 'John Physics',
    class: '10-A',
    room: 'Room 102'
  },
  {
    id: '3',
    day: 'Tuesday',
    time: '9:00 AM',
    subject: 'Chemistry',
    teacher: 'Mary Chemistry',
    class: '10-A',
    room: 'Room 103'
  }
];

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Parent-Teacher Meeting',
    message: 'Parent-teacher meeting scheduled for next Friday at 2:00 PM',
    type: 'info',
    date: new Date().toISOString(),
    read: false,
    author: 'John Admin'
  },
  {
    id: '2',
    title: 'Exam Results Published',
    message: 'Mid-term exam results have been published and are now available',
    type: 'success',
    date: new Date().toISOString(),
    read: false,
    author: 'Sarah Teacher'
  }
];

const mockMemos: Memo[] = [
  {
    id: '1',
    title: 'School Maintenance Notice',
    content: 'The school will undergo maintenance during the weekend. All activities are suspended.',
    author: 'John Admin',
    date: new Date().toISOString(),
    priority: 'high',
    recipients: ['all']
  }
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>(mockStudents);
  const [timetable, setTimetable] = useState<TimetableEntry[]>(mockTimetable);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [memos, setMemos] = useState<Memo[]>(mockMemos);

  const addStudent = (studentData: Omit<Student, 'id' | 'results'>) => {
    const newStudent: Student = {
      ...studentData,
      id: String(students.length + 1),
      results: []
    };
    setStudents(prev => [...prev, newStudent]);
  };

  const addResult = (resultData: Omit<Result, 'id'>) => {
    const newResult: Result = {
      ...resultData,
      id: String(Date.now()),
      grade: calculateGrade(resultData.marks, resultData.totalMarks)
    };
    
    setStudents(prev => prev.map(student => 
      student.id === resultData.studentId
        ? { ...student, results: [...student.results, newResult] }
        : student
    ));
  };

  const calculateGrade = (marks: number, totalMarks: number): string => {
    const percentage = (marks / totalMarks) * 100;
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
  };

  const addTimetableEntry = (entryData: Omit<TimetableEntry, 'id'>) => {
    const newEntry: TimetableEntry = {
      ...entryData,
      id: String(Date.now())
    };
    setTimetable(prev => [...prev, newEntry]);
  };

  const updateTimetableEntry = (id: string, entryData: Partial<TimetableEntry>) => {
    setTimetable(prev => prev.map(entry => 
      entry.id === id ? { ...entry, ...entryData } : entry
    ));
  };

  const deleteTimetableEntry = (id: string) => {
    setTimetable(prev => prev.filter(entry => entry.id !== id));
  };

  const addNotification = (notificationData: Omit<Notification, 'id'>) => {
    const newNotification: Notification = {
      ...notificationData,
      id: String(Date.now())
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(notification =>
      notification.id === id ? { ...notification, read: true } : notification
    ));
  };

  const addMemo = (memoData: Omit<Memo, 'id'>) => {
    const newMemo: Memo = {
      ...memoData,
      id: String(Date.now())
    };
    setMemos(prev => [newMemo, ...prev]);
  };

  return (
    <AppContext.Provider value={{
      students,
      timetable,
      notifications,
      memos,
      addStudent,
      addResult,
      addTimetableEntry,
      updateTimetableEntry,
      deleteTimetableEntry,
      addNotification,
      markNotificationRead,
      addMemo
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}