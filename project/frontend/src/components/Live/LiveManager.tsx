import { useAuth } from '../../context/AuthContext';
import HostConsole from './HostConsole';
import PlayerApp from './PlayerApp';

/**
 * In-app entry for the live quiz. Staff host games; a logged-in student lands
 * straight on the guest join screen so they can jump into a game their teacher
 * is running. (Guests without an account use the public "Join a quiz" page.)
 */
export default function LiveManager() {
  const { user } = useAuth();
  if (user?.role === 'student') return <PlayerApp />;
  return <HostConsole />;
}
