import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Calendar, Clock, User, MapPin, Loader2 } from 'lucide-react';
import { timetableAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface TimetableEntry {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
  subject: number;
  subject_name?: string;
  teacher: number;
  teacher_name?: string;
  class_name: string;
  classroom: number;
  classroom_name?: string;
}

interface Subject {
  id: number;
  name: string;
  code: string;
}

interface Classroom {
  id: number;
  name: string;
  capacity: number;
}

interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
}

export default function TimetableManager() {
  const { user } = useAuth();
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [selectedDay, setSelectedDay] = useState('monday');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const days = [
    { value: 'monday', label: 'Monday' },
    { value: 'tuesday', label: 'Tuesday' },
    { value: 'wednesday', label: 'Wednesday' },
    { value: 'thursday', label: 'Thursday' },
    { value: 'friday', label: 'Friday' },
    { value: 'saturday', label: 'Saturday' }
  ];

  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00', 
    '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  const [formData, setFormData] = useState({
    day: selectedDay,
    start_time: '',
    end_time: '',
    subject: '',
    teacher: '',
    class_name: '',
    classroom: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [timetableRes, subjectsRes, classroomsRes, teachersRes] = await Promise.all([
        timetableAPI.getTimetable(),
        timetableAPI.getSubjects(),
        timetableAPI.getClassrooms(),
        timetableAPI.getTeachers()
      ]);

      setTimetable(timetableRes.data.results || timetableRes.data);
      setSubjects(subjectsRes.data.results || subjectsRes.data);
      setClassrooms(classroomsRes.data.results || classroomsRes.data);
      setTeachers(teachersRes.data.results || teachersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const submitData = {
        day: formData.day,
        start_time: formData.start_time,
        end_time: formData.end_time,
        subject: parseInt(formData.subject),
        teacher: parseInt(formData.teacher),
        class_name: formData.class_name,
        classroom: parseInt(formData.classroom)
      };

      if (editingEntry) {
        await timetableAPI.updateTimetableEntry(editingEntry.id, submitData);
      } else {
        await timetableAPI.createTimetableEntry(submitData);
      }

      // Reload data to get updated list
      await loadData();
      
      // Reset form
      setFormData({
        day: selectedDay,
        start_time: '',
        end_time: '',
        subject: '',
        teacher: '',
        class_name: '',
        classroom: ''
      });
      setShowAddForm(false);
      setEditingEntry(null);
    } catch (error) {
      console.error('Error submitting timetable entry:', error);
      alert('Error saving timetable entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setFormData({
      day: entry.day,
      start_time: entry.start_time,
      end_time: entry.end_time,
      subject: entry.subject.toString(),
      teacher: entry.teacher.toString(),
      class_name: entry.class_name,
      classroom: entry.classroom.toString()
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this timetable entry?')) {
      try {
        await timetableAPI.deleteTimetableEntry(id);
        await loadData(); // Reload data
      } catch (error) {
        console.error('Error deleting timetable entry:', error);
        alert('Error deleting timetable entry. Please try again.');
      }
    }
  };

  const getDayEntries = (day: string) => {
    return timetable
      .filter(entry => entry.day === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const formatTime = (time: string) => {
    return new Date(`1970-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading timetable data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Timetable Management</h1>
          <p className="text-gray-600 mt-1">Create and manage class schedules</p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingEntry(null);
            setFormData({
              day: selectedDay,
              start_time: '',
              end_time: '',
              subject: '',
              teacher: '',
              class_name: '',
              classroom: ''
            });
          }}
          className="mt-4 sm:mt-0 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Schedule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Entries</p>
              <p className="text-3xl font-bold text-gray-900">{timetable.length}</p>
            </div>
            <Calendar className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Subjects</p>
              <p className="text-3xl font-bold text-gray-900">{subjects.length}</p>
            </div>
            <Calendar className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Classrooms</p>
              <p className="text-3xl font-bold text-gray-900">{classrooms.length}</p>
            </div>
            <MapPin className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Teachers</p>
              <p className="text-3xl font-bold text-gray-900">{teachers.length}</p>
            </div>
            <User className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Day Tabs */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex space-x-1 mb-6 overflow-x-auto">
          {days.map((day) => (
            <button
              key={day.value}
              onClick={() => setSelectedDay(day.value)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 whitespace-nowrap ${
                selectedDay === day.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>

        {/* Timetable Grid */}
        <div className="space-y-4">
          {getDayEntries(selectedDay).length > 0 ? (
            getDayEntries(selectedDay).map((entry) => (
              <div
                key={entry.id}
                className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="flex items-center">
                      <Clock className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">
                        {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">{entry.subject_name}</span>
                    </div>
                    <div className="flex items-center">
                      <User className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">{entry.teacher_name}</span>
                    </div>
                    <div className="flex items-center">
                      <MapPin className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">{entry.class_name} • {entry.classroom_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleEdit(entry)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg mb-2">No classes scheduled for {days.find(d => d.value === selectedDay)?.label}</p>
              <p className="text-gray-400">Add a schedule to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              {editingEntry ? 'Edit Schedule' : 'Add New Schedule'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Day</label>
                <select
                  value={formData.day}
                  onChange={(e) => setFormData({ ...formData, day: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  {days.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                  <select
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select start time</option>
                    {timeSlots.map(time => (
                      <option key={time} value={time}>{formatTime(time)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <select
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select end time</option>
                    {timeSlots.map(time => (
                      <option key={time} value={time}>{formatTime(time)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                <select
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select subject</option>
                  {subjects.map(subject => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name} ({subject.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Teacher</label>
                <select
                  value={formData.teacher}
                  onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select teacher</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.first_name} {teacher.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                <input
                  type="text"
                  value={formData.class_name}
                  onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 10-A"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Classroom</label>
                <select
                  value={formData.classroom}
                  onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select classroom</option>
                  {classrooms.map(classroom => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name} (Capacity: {classroom.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      {editingEntry ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    editingEntry ? 'Update Schedule' : 'Add Schedule'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingEntry(null);
                  }}
                  disabled={isSubmitting}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}