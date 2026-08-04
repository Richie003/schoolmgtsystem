import { useAuth } from '../../context/AuthContext';
import StudentExams from './StudentExams';
import ExamAdmin from './ExamAdmin';

export default function CBTManager() {
  const { user } = useAuth();

  // Students get the exam-taking experience; staff get authoring and results.
  return user?.role === 'student' ? <StudentExams /> : <ExamAdmin />;
}
