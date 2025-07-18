import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  CurrencyDollarIcon,
  ShoppingCartIcon,
  ArrowTrendingUpIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Analytics as AnalyticsType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsType>({
    total_sales: 0,
    total_orders: 0,
    conversion_rate: 0,
    revenue_by_day: [],
    top_products: [],
    recent_orders: [],
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const { user } = useAuth();
  const subscriptionRef = useRef<any>(null);
  const pageIdsRef = useRef<string[]>([]);
  const fetchRef = useRef(false);

  const fetchAnalytics = useCallback(
    debounce(async () => {
      if (!user || fetchRef.current) {
        return;
      }
      fetchRef.current = true;
      try {
        setLoading(true);
        const { data: pagesData, error: pagesError } = await supabase
          .from('checkout_pages')
          .select('id')
          .eq('user_id', user.id);

        if (pagesError) {
          throw new Error(`Error fetching checkout pages: ${pagesError.message}`);
        }

        const pageIds = pagesData?.map((page) => page.id) || [];
        pageIdsRef.current = pageIds;

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

        const now = new Date();
        let startDate: Date;
        switch (timeRange) {
          case '7d':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case '30d':
            startDate = new Date(now.setDate(now.getDate() - 30));
            break;
          case '90d':
            startDate = new Date(now.setDate(now.getDate() - 90));
            break;
          case '1y':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
          default:
            startDate = new Date(now.setDate(now.getDate() - 7));
        }

        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('total_amount, created_at, products, customer_info, status, payment_method, checkout_page_id')
          .in('checkout_page_id', pageIds)
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false });

        if (ordersError) {
          throw new Error(`Error fetching orders: ${ordersError.message}`);
        }

        const totalSales = ordersData?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
        const totalOrders = ordersData?.length || 0;
        const conversionRate = totalOrders > 0 ? (totalOrders / 1000) * 100 : 0;

        const revenueByDay = ordersData
          ? ordersData.reduce((acc: { [key: string]: number }, order) => {
              const date = new Date(order.created_at).toISOString().split('T')[0];
              acc[date] = (acc[date] || 0) + (order.total_amount || 0);
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
        console.error('Error fetching analytics:', error);
        toast.error('Failed to load analytics data');
        setAnalytics({
          total_sales: 0,
          total_orders: 0,
          conversion_rate: 0,
          revenue_by_day: [],
          top_products: [],
          recent_orders: [],
        });
      } finally {
        setLoading(false);
        fetchRef.current = false;
      }
    }, 500),
    [user, timeRange]
  );

  useEffect(() => {
    if (!user) {
      setLoading(false);
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

    fetchAnalytics();

    if (pageIdsRef.current.length > 0) {
      subscriptionRef.current?.unsubscribe();
      const subscription = supabase
        .channel('orders_channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `checkout_page_id=in.(${pageIdsRef.current.join(',')})`,
          },
          () => {
            fetchAnalytics();
          }
        )
        .subscribe();
      subscriptionRef.current = subscription;
    }

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [user, timeRange, fetchAnalytics]);

  const stats = useMemo(
    () => [
      {
        name: 'Receita Total',
        value: `$${analytics.total_sales.toLocaleString()}`,
        change: '+0.0%',
        changeType: 'positive',
        icon: CurrencyDollarIcon,
      },
      {
        name: 'Total de Pedidos',
        value: analytics.total_orders.toString(),
        change: '+0.0%',
        changeType: 'positive',
        icon: ShoppingCartIcon,
      },
      {
        name: 'Taxa de Conversão',
        value: `${analytics.conversion_rate.toFixed(1)}%`,
        change: '+0.0%',
        changeType: 'positive',
        icon: ArrowTrendingUpIcon,
      },
      {
        name: 'Valor Médio do Pedido',
        value: `$${(analytics.total_sales / (analytics.total_orders || 1)).toFixed(2)}`,
        change: '+0.0%',
        changeType: 'positive',
        icon: UsersIcon,
      },
    ],
    [analytics]
  );

  const recentActivity = useMemo(
    () =>
      analytics.recent_orders.slice(0, 4).map((order) => ({
        action: 'Novo pedido recebido',
        details: order.products && Array.isArray(order.products)
          ? `${order.products.map((p: any) => p.name).join(', ')} - $${order.total_amount}`
          : 'Unknown product - $' + order.total_amount,
        time: new Date(order.created_at).toLocaleString('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
        }),
        type: 'order',
      })),
    [analytics]
  );

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
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Please log in</h3>
        <p className="text-sm sm:text-base text-gray-600">You need to be logged in to view your analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Time Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Análises</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Acompanhe o desempenho das suas vendas e insights</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['7d', '30d', '90d', '1y'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {range === '7d'
                ? 'Últimos 7 dias'
                : range === '30d'
                ? 'Últimos 30 dias'
                : range === '90d'
                ? 'Últimos 90 dias'
                : 'Último ano'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                <div className="flex items-center mt-2">
                  <span
                    className={`text-xs sm:text-sm font-medium ${
                      stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {stat.change}
                  </span>
                  <span className="text-xs sm:text-sm text-gray-500 ml-1">vs período anterior</span>
                </div>
              </div>
              <div className="p-2 sm:p-3 bg-indigo-100 rounded-lg">
                <stat.icon className="h-5 sm:h-6 w-5 sm:w-6 text-indigo-600" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
        {/* Revenue Chart */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Receita ao Longo do Tempo</h3>
          <ResponsiveContainer width="100%" height={250} className="min-h-[200px] sm:min-h-[300px]">
            <LineChart data={analytics.revenue_by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={10}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }
              />
              <YAxis stroke="#6b7280" fontSize={10} tickFormatter={(value) => `$${value}`} />
              <Tooltip
                formatter={(value) => [`$${value}`, 'Receita']}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Produtos Mais Vendidos</h3>
          <ResponsiveContainer width="100%" height={250} className="min-h-[200px] sm:min-h-[300px]">
            <BarChart data={analytics.top_products} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#6b7280" fontSize={10} />
              <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={10} width={80} />
              <Tooltip formatter={(value) => [`${value}`, 'Vendas']} />
              <Bar dataKey="sales" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Atividade Recente</h3>
        </div>
        <div className="p-4 sm:p-6">
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-600">No recent activity</p>
            ) : (
              recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="p-2 rounded-full bg-green-100">
                    <ShoppingCartIcon className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{activity.action}</p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">{activity.details}</p>
                  </div>
                  <span className="text-xs text-gray-500">{activity.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}