import { BookOpen, Loader2 } from 'lucide-react';

export default function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 flex items-center justify-center">
      <div className="text-center">
        {/* Logo with animation */}
        <div className="flex justify-center items-center mb-8">
          <div className="relative">
            <div className="bg-brand-600 p-4 rounded-full animate-pulse">
              <BookOpen className="h-12 w-12 text-white" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Loader2 className="h-6 w-6 text-brand-600 animate-spin" />
            </div>
          </div>
        </div>

        {/* Loading text */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">
            School Management System
          </h2>
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-5 w-5 text-brand-600 animate-spin" />
            <p className="text-gray-600 font-medium">Loading your dashboard...</p>
          </div>
        </div>

        {/* Loading progress bar */}
        <div className="mt-8 w-64 mx-auto">
          <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="bg-gradient-to-r from-brand-500 to-brand-600 h-full rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* Subtle loading dots */}
        <div className="flex justify-center space-x-1 mt-6">
          <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
}