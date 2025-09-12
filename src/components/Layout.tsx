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
  ShoppingBagIcon
} from '@heroicons/react/24/outline';
import { SidebarProvider } from '../contexts/SidebarContext';

export default function Layout() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const closeSidebar = () => setIsSidebarOpen(false);

  const navigation = [
    { name: 'Painel', href: '/dashboard', icon: HomeIcon },
    { name: 'Páginas de Checkout', href: '/checkout-pages', icon: CreditCardIcon },
    { name: 'Produtos', href: '/products', icon: ShoppingBagIcon },
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
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-[var(--sidebar-bg)] rounded-md shadow-md"
        onClick={toggleSidebar}
      >
        {isSidebarOpen ? (
          <XMarkIcon className="h-6 w-6 text-[var(--text-color)]" />
        ) : (
          <Bars3Icon className="h-6 w-6 text-[var(--text-color)]" />
        )}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[var(--sidebar-bg)] shadow-lg transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-center border-b border-[var(--border-color)]">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <CreditCardIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xl font-bold text-[var(--text-color)]">CheckoutPro</span>
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
                        ? 'bg-[var(--active-bg)] text-[var(--active-text)] border border-[var(--border-color)]'
                        : 'text-[var(--text-color)] hover:bg-[var(--border-color)]'
                    }`}
                    onClick={closeSidebar}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--border-color)]">
          <div className="flex items-center space-x-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-color)] truncate">
                {user?.user_metadata?.name || user?.email}
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleSignOut}
              className="flex-1 flex items-center space-x-2 px-3 py-2 text-sm text-[var(--text-color)] hover:bg-[var(--border-color)] rounded-lg transition-colors"
            >
              <ArrowLeftStartOnRectangleIcon className="h-4 w-4" />
              <span>Sair</span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex-1 flex items-center space-x-2 px-3 py-2 text-sm text-[var(--text-color)] hover:bg-[var(--border-color)] rounded-lg transition-colors"
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
      <div className="md:pl-64 transition-all duration-300">
        <header className="bg-[var(--header-bg)] shadow-sm border-b border-[var(--border-color)]">
          <div className="px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h1 className="text-lg sm:text-2xl font-semibold text-[var(--text-color)]">
                {navigation.find((item) => item.href === location.pathname)?.name || 'Painel'}
              </h1>
              <Link
                to="/checkout-pages/new"
                className="inline-flex items-center space-x-2 bg-[var(--primary-bg)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)] transition-colors text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Nova Página de Checkout</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <SidebarProvider toggleSidebar={toggleSidebar} closeSidebar={closeSidebar}>
            <Outlet />
          </SidebarProvider>
        </main>
      </div>
    </div>
  );
}