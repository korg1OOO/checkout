import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  HomeIcon,
  CreditCardIcon,
  ChartBarIcon,
  CogIcon,
  ArrowLeftStartOnRectangleIcon,
  PlusIcon,
  Bars3Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';

export default function Layout() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Painel', href: '/dashboard', icon: HomeIcon },
    { name: 'Páginas de Checkout', href: '/checkout-pages', icon: CreditCardIcon },
    { name: 'Análises', href: '/analytics', icon: ChartBarIcon },
    { name: 'Configurações', href: '/settings', icon: CogIcon },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen">
      {/* Mobile Menu Button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-700 rounded-md shadow-md"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? (
          <XMarkIcon className="h-6 w-6 text-gray-900 dark:text-gray-100" />
        ) : (
          <Bars3Icon className="h-6 w-6 text-gray-900 dark:text-gray-100" />
        )}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-700 shadow-lg transform md:transform-none transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="flex h-16 items-center justify-center border-b border-gray-200 dark:border-gray-600">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <CreditCardIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">CheckoutPro</span>
          </Link>
        </div>

        <nav className="mt-8 px-4">
          <ul className="space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={`flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-100 dark:bg-gray-600 text-indigo-700 dark:text-indigo-200'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center space-x-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user?.user_metadata?.name || user?.email}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleSignOut}
              className="flex-1 flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <ArrowLeftStartOnRectangleIcon className="h-4 w-4" />
              <span>Sair</span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex-1 flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              {theme === 'light' ? (
                <MoonIcon className="h-4 w-4" />
              ) : (
                <SunIcon className="h-4 w-4" />
              )}
              <span>{theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className={`transition-all duration-300 ${isSidebarOpen ? 'md:pl-64' : 'pl-0 md:pl-64'}`}>
        <header className="bg-white dark:bg-gray-700 shadow-sm border-b border-gray-200 dark:border-gray-600">
          <div className="px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h1 className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {navigation.find((item) => item.href === location.pathname)?.name || 'Painel'}
              </h1>
              <Link
                to="/checkout-pages/new"
                className="inline-flex items-center space-x-2 bg-indigo-600 dark:bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Nova Página de Checkout</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}