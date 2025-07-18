// src/pages/Dashboard.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCardIcon,
  ChartBarIcon,
  UsersIcon,
  CurrencyDollarIcon,
  PlusIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { CheckoutPage, Analytics } from '../types';
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

export default function Dashboard() {
  const [checkoutPages, setCheckoutPages] = useState<CheckoutPage[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const subscriptionRef = useRef<{ checkoutPages?: any; orders?: any }>({});
  const fetchRef = useRef(false);

  const fetchUserData = useCallback(
    debounce(async () => {
      if (!user || fetchRef.current) {
        return;
      }
      fetchRef.current = true;
      try {
        setLoading(true);

        // Fetch checkout pages
        const { data: pagesData, error: pagesError } = await supabase
          .from('checkout_pages')
          .select('*')
          .eq('user_id', user.id);

        if (pagesError) {
          throw new Error(`Error fetching checkout pages: ${pagesError.message}`);
        }

        setCheckoutPages(pagesData || []);

        // Fetch orders for analytics
        const pageIds = pagesData?.map((page) => page.id) || [];
        if (pageIds.length === 0) {
          setAnalytics({
            total_sales: 0,
            total_orders: 0,
            conversion_rate: 0,
            revenue_by_day: [],
            top_products: [],
            recent_orders: [],
          });
          return;
        }

        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('total_amount, created_at, products')
          .in('checkout_page_id', pageIds);

        if (ordersError) {
          throw new Error(`Error fetching orders: ${ordersError.message}`);
        }

        // Calculate analytics
        const totalSales = ordersData?.reduce((sum, order) => sum + order.total_amount, 0) || 0;
        const totalOrders = ordersData?.length || 0;
        const conversionRate = totalOrders > 0 ? (totalOrders / 1000) * 100 : 0;

        const revenueByDay = ordersData
          ? ordersData.reduce((acc: { [key: string]: number }, order) => {
              const date = new Date(order.created_at).toISOString().split('T')[0];
              acc[date] = (acc[date] || 0) + order.total_amount;
              return acc;
            }, {})
          : {};

        const revenueByDayArray = Object.entries(revenueByDay).map(([date, revenue]) => ({
          date,
          revenue,
        }));

        const productSales = ordersData
          ? ordersData.reduce((acc: { [key: string]: number }, order) => {
              if (order.products && Array.isArray(order.products)) {
                order.products.forEach((product: { name: string; quantity: number }) => {
                  if (product.name && product.quantity) {
                    acc[product.name] = (acc[product.name] || 0) + product.quantity;
                  }
                });
              }
              return acc;
            }, {})
          : {};

        const topProducts = Object.entries(productSales)
          .map(([name, sales]) => ({ name, sales }))
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5);

        setAnalytics({
          total_sales: totalSales,
          total_orders: totalOrders,
          conversion_rate: conversionRate,
          revenue_by_day: revenueByDayArray,
          top_products: topProducts,
          recent_orders: ordersData || [],
        });
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
        fetchRef.current = false;
      }
    }, 500),
    [user]
  );

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setAnalytics(null);
      return;
    }

    fetchUserData();

    // Set up real-time subscriptions
    subscriptionRef.current.checkoutPages?.unsubscribe();
    const checkoutPagesSubscription = supabase
      .channel('checkout_pages_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checkout_pages',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('Checkout pages subscription triggered at:', new Date().toISOString());
          fetchUserData();
        }
      )
      .subscribe();
    subscriptionRef.current.checkoutPages = checkoutPagesSubscription;

    // Orders subscription will be set up after checkoutPages are fetched
    if (checkoutPages.length > 0) {
      subscriptionRef.current.orders?.unsubscribe();
      const ordersSubscription = supabase
        .channel('orders_channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `checkout_page_id=in.(${checkoutPages.map((page) => page.id).join(',')})`,
          },
          () => {
            console.log('Orders subscription triggered at:', new Date().toISOString());
            fetchUserData();
          }
        )
        .subscribe();
      subscriptionRef.current.orders = ordersSubscription;
    }

    return () => {
      subscriptionRef.current.checkoutPages?.unsubscribe();
      subscriptionRef.current.orders?.unsubscribe();
    };
  }, [user, fetchUserData]); // Removed checkoutPages from dependencies

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
        <p className="text-gray-600">You need to be logged in to view your dashboard.</p>
      </div>
    );
  }

  const stats = [
    {
      name: 'Receita Total',
      value: analytics ? `$${analytics.total_sales.toLocaleString()}` : '$0',
      icon: CurrencyDollarIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Total de Pedidos',
      value: analytics ? analytics.total_orders.toString() : '0',
      icon: ChartBarIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Taxa de Conversão',
      value: analytics ? `${analytics.conversion_rate.toFixed(1)}%` : '0.0%',
      icon: UsersIcon,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      name: 'Páginas Ativas',
      value: checkoutPages.filter((page) => page.is_active).length.toString(),
      icon: CreditCardIcon,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Bem-vindo de volta!</h1>
        <p className="text-indigo-100 mb-6">
          Gerencie suas páginas de checkout e acompanhe o desempenho das suas vendas.
        </p>
        <Link
          to="/checkout-pages/new"
          className="inline-flex items-center space-x-2 bg-white text-indigo-600 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          <PlusIcon className="h-5 w-5" />
          <span>Criar Nova Página de Checkout</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Suas Páginas de Checkout</h2>
            <Link
              to="/checkout-pages"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Ver todas
            </Link>
          </div>
        </div>
        <div className="p-6">
          {checkoutPages.length === 0 ? (
            <div className="text-center py-12">
              <CreditCardIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma página de checkout ainda</h3>
              <p className="text-gray-600 mb-6">
                Crie sua primeira página de checkout para começar a vender seus produtos.
              </p>
              <Link
                to="/checkout-pages/new"
                className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Criar Página de Checkout</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {checkoutPages.map((page) => (
                <div key={page.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 truncate">{page.title}</h3>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{page.description}</p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        page.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {page.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: page.theme.primary_color }}
                      />
                      <span className="text-xs text-gray-500">/{page.slug}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Link
                        to={`/checkout/${page.slug}`}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Preview"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/checkout-pages/${page.id}/edit`}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Editar
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}