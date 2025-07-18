import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  PlusIcon, 
  EyeIcon, 
  PencilIcon, 
  TrashIcon,
  DocumentDuplicateIcon,
  ShareIcon
} from '@heroicons/react/24/outline';
import { CheckoutPage } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

// Utility to debounce a function
function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default function CheckoutPages() {
  const [checkoutPages, setCheckoutPages] = useState<CheckoutPage[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const subscriptionRef = useRef<any>(null);

  const fetchCheckoutPages = useCallback(
    debounce(async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('checkout_pages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(`Error fetching checkout pages: ${error.message}`);
        }

        setCheckoutPages(data || []);
      } catch (error) {
        console.error('Error fetching checkout pages:', error);
        toast.error('Failed to load checkout pages');
      } finally {
        setLoading(false);
      }
    }, 500),
    [user]
  );

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchCheckoutPages();

    // Set up real-time subscription
    const subscription = supabase
      .channel('checkout_pages_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checkout_pages',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchCheckoutPages()
      )
      .subscribe();

    subscriptionRef.current = subscription;

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [user, fetchCheckoutPages]);

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/checkout/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Checkout link copied to clipboard!');
  };

  const handleDuplicate = async (page: CheckoutPage) => {
    if (!user) {
      toast.error('You must be logged in to duplicate a page');
      return;
    }

    try {
      const newPage = {
        ...page,
        title: `${page.title} (Copy)`,
        slug: `${page.slug}-${Date.now()}`, // Ensure unique slug
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('checkout_pages')
        .insert(newPage);

      if (error) {
        throw new Error(`Error duplicating page: ${error.message}`);
      }

      toast.success(`"${page.title}" duplicated successfully!`);
      fetchCheckoutPages(); // Refresh data
    } catch (error) {
      console.error('Error duplicating page:', error);
      toast.error('Failed to duplicate page');
    }
  };

  const handleDelete = async (page: CheckoutPage) => {
    if (!user) {
      toast.error('You must be logged in to delete a page');
      return;
    }

    if (window.confirm(`Are you sure you want to delete "${page.title}"?`)) {
      try {
        const { error } = await supabase
          .from('checkout_pages')
          .delete()
          .eq('id', page.id)
          .eq('user_id', user.id); // Ensure user owns the page

        if (error) {
          throw new Error(`Error deleting page: ${error.message}`);
        }

        toast.success(`"${page.title}" deleted successfully!`);
        fetchCheckoutPages(); // Refresh data
      } catch (error) {
        console.error('Error deleting page:', error);
        toast.error('Failed to delete page');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Please log in</h3>
        <p className="text-gray-600">You need to be logged in to view your checkout pages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Páginas de Checkout</h1>
          <p className="text-gray-600 mt-1">
            Crie e gerencie suas páginas de checkout personalizadas
          </p>
        </div>
        <Link
          to="/checkout-pages/new"
          className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Nova Página</span>
        </Link>
      </div>

      {/* Pages Grid */}
      {checkoutPages.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PlusIcon className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma página de checkout ainda</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Comece criando sua primeira página de checkout. Personalize-a para combinar com sua marca e comece a vender!
          </p>
          <Link
            to="/checkout-pages/new"
            className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Criar Sua Primeira Página</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {checkoutPages.map((page) => (
            <div key={page.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              {/* Preview Header */}
              <div 
                className="h-24 p-4 flex items-center"
                style={{ backgroundColor: page.theme.background_color }}
              >
                <div className="flex items-center space-x-3">
                  {page.logo_url ? (
                    <img src={page.logo_url} alt="Logo" className="h-8 w-8 rounded" />
                  ) : (
                    <div 
                      className="h-8 w-8 rounded flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: page.theme.primary_color }}
                    >
                      {page.title.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium" style={{ color: page.theme.text_color }}>
                      {page.title}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: page.theme.primary_color }}
                      />
                      <span className="text-xs text-gray-500">/{page.slug}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    page.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {page.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(page.updated_at).toLocaleDateString()}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {page.description || 'Nenhuma descrição fornecida'}
                </p>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleCopyLink(page.slug)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copiar link"
                    >
                      <ShareIcon className="h-4 w-4" />
                    </button>
                    <Link
                      to={`/checkout/${page.slug}`}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Visualizar"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDuplicate(page)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Duplicar"
                    >
                      <DocumentDuplicateIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link
                      to={`/checkout-pages/${page.id}/edit`}
                      className="p-2 text-indigo-600 hover:text-indigo-700 transition-colors"
                      title="Editar"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(page)}
                      className="p-2 text-red-600 hover:text-red-700 transition-colors"
                      title="Excluir"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}