import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  SwatchIcon,
  EyeIcon,
  BookmarkIcon,
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { CheckoutPage, CheckoutTheme, CustomField, Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const schema = yup.object({
  title: yup.string().required('Título é obrigatório').max(255, 'Título deve ter no máximo 255 caracteres'),
  slug: yup
    .string()
    .required('URL slug é obrigatório')
    .matches(/^[a-z0-9-]+$/,'Slug só pode conter letras minúsculas, números e hífens')
    .max(100, 'Slug deve ter no máximo 100 caracteres'),
  description: yup.string().max(1000, 'Descrição deve ter no máximo 1000 caracteres').nullable(),
  logo_url: yup.string().url('Deve ser uma URL válida').nullable(),
  is_active: yup.boolean(),
});

interface FormData {
  title: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
}

export default function CheckoutPageBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditing = id !== 'new';
  const subscriptionRef = useRef<any>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);

  const [checkoutPage, setCheckoutPage] = useState<CheckoutPage | null>(null);
  const [theme, setTheme] = useState<CheckoutTheme>({
    primary_color: '#3B82F6',
    secondary_color: '#1E40AF',
    background_color: '#FFFFFF',
    text_color: '#1F2937',
    font_family: 'Inter',
    border_radius: '8px',
    button_style: 'rounded',
  });
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(isEditing);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      title: '',
      slug: '',
      description: null,
      logo_url: null,
      is_active: true,
    },
  });

  const watchedTitle = watch('title');
  const watchedSlug = watch('slug');
  const watchedIsActive = watch('is_active');

  // Auto-generate slug from title
  useEffect(() => {
    if (watchedTitle && !isEditing) {
      const slug = watchedTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setValue('slug', slug);
    }
  }, [watchedTitle, setValue, isEditing]);

  // Check slug uniqueness
  const checkSlugUniqueness = useCallback(
    debounce(async (slug: string) => {
      if (!slug || isEditing) return;
      setCheckingSlug(true);
      try {
        const { data, error } = await supabase
          .from('checkout_pages')
          .select('id')
          .eq('slug', slug)
          .neq('user_id', user?.id || '')
          .single();

        if (error && error.code !== 'PGRST116') {
          throw new Error(`Error checking slug: ${error.message}`);
        }
        if (data) {
          toast.error('Este slug já está em uso. Escolha outro.');
          setValue('slug', `${slug}-${Date.now()}`);
        }
      } catch (error) {
        console.error('Error checking slug:', error);
        toast.error('Erro ao verificar slug');
      } finally {
        setCheckingSlug(false);
      }
    }, 500),
    [user, isEditing, setValue]
  );

  useEffect(() => {
    if (watchedSlug && !isEditing) {
      checkSlugUniqueness(watchedSlug);
    }
  }, [watchedSlug, checkSlugUniqueness, isEditing]);

  // Fetch existing page data
  useEffect(() => {
    if (!user) {
      setLoading(false);
      toast.error('Você precisa estar logado para acessar esta página');
      navigate('/auth');
      return;
    }

    if (isEditing && id) {
      const fetchPage = async () => {
        try {
          setLoading(true);
          const { data, error } = await supabase
            .from('checkout_pages')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

          if (error) {
            throw new Error(`Error fetching checkout page: ${error.message}`);
          }

          if (!data) {
            throw new Error('Página não encontrada ou você não tem permissão');
          }

          setCheckoutPage(data);
          setTheme(data.theme || theme);
          setCustomFields(data.custom_fields || []);
          setProducts(data.products || []);
          reset({
            title: data.title,
            slug: data.slug,
            description: data.description || null,
            logo_url: data.logo_url || null,
            is_active: data.is_active,
          });
        } catch (error) {
          console.error('Error fetching page:', error);
          toast.error('Falha ao carregar página de checkout');
          navigate('/checkout-pages');
        } finally {
          setLoading(false);
        }
      };

      fetchPage();
    } else {
      setLoading(false);
    }
  }, [id, isEditing, user, navigate, reset]);

  // Real-time subscription
  useEffect(() => {
    if (!user || !isEditing || !id) return;

    const subscription = supabase
      .channel('checkout_page_channel')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'checkout_pages',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new.user_id === user.id) {
            setCheckoutPage(payload.new as CheckoutPage);
            setTheme(payload.new.theme || theme);
            setCustomFields(payload.new.custom_fields || []);
            setProducts(payload.new.products || []);
            reset({
              title: payload.new.title,
              slug: payload.new.slug,
              description: payload.new.description || null,
              logo_url: payload.new.logo_url || null,
              is_active: payload.new.is_active,
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('Subscription error:', err);
          toast.error('Falha ao configurar atualizações em tempo real');
        }
      });

    subscriptionRef.current = subscription;

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [user, isEditing, id, reset]);

  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('Você precisa estar logado para salvar');
      return;
    }

    try {
      const pageData: Partial<CheckoutPage> = {
        title: data.title,
        slug: data.slug,
        description: data.description || undefined,
        logo_url: data.logo_url || undefined,
        theme,
        custom_fields: customFields,
        products,
        is_active: data.is_active,
        user_id: user.id,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('checkout_pages')
          .update(pageData)
          .eq('id', id)
          .eq('user_id', user.id);

        if (error) {
          throw new Error(`Error updating page: ${error.message}`);
        }
        toast.success('Página de checkout atualizada!');
      } else {
        const { error } = await supabase
          .from('checkout_pages')
          .insert(pageData);

        if (error) {
          throw new Error(`Error creating page: ${error.message}`);
        }
        toast.success('Página de checkout criada!');
      }

      navigate('/checkout-pages');
    } catch (error) {
      console.error('Error saving page:', error);
      toast.error('Falha ao salvar página de checkout');
    }
  };

  const addCustomField = () => {
    const newField: CustomField = {
      id: Date.now().toString(),
      name: `field_${customFields.length + 1}`,
      label: 'Novo Campo',
      type: 'text',
      required: false,
      placeholder: '',
    };
    setCustomFields([...customFields, newField]);
  };

  const updateCustomField = (index: number, field: Partial<CustomField>) => {
    const updated = [...customFields];
    updated[index] = { ...updated[index], ...field };
    setCustomFields(updated);
  };

  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const addProduct = () => {
    const newProduct: Product = {
      id: Date.now().toString(),
      name: 'Novo Produto',
      description: '',
      price: 0,
      type: 'digital',
      is_active: true,
      requires_shipping: false,
    };
    setProducts([...products, newProduct]);
  };

  const updateProduct = (index: number, product: Partial<Product>) => {
    const updated = [...products];
    updated[index] = {
      ...updated[index],
      ...product,
      requires_shipping: product.type === 'physical' ? true : product.requires_shipping,
    };
    setProducts(updated);
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
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
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Por favor, faça login</h3>
        <p className="text-sm sm:text-base text-gray-600">Você precisa estar logado para criar ou editar páginas de checkout.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'basic', name: 'Informações Básicas', icon: '📝' },
    { id: 'theme', name: 'Tema', icon: '🎨' },
    { id: 'fields', name: 'Campos Personalizados', icon: '📋' },
    { id: 'products', name: 'Produtos', icon: '🛍️' },
    { id: 'preview', name: 'Visualizar', icon: '👁️' },
  ];

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Mobile Menu Button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
        onClick={() => setIsNavOpen(!isNavOpen)}
      >
        {isNavOpen ? (
          <XMarkIcon className="h-6 w-6 text-gray-900" />
        ) : (
          <Bars3Icon className="h-6 w-6 text-gray-900" />
        )}
      </button>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {isEditing ? 'Editar Página de Checkout' : 'Criar Nova Página de Checkout'}
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          {isEditing ? 'Atualize as configurações da sua página de checkout' : 'Configure sua página de checkout personalizada'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:gap-8">
        {/* Sidebar Navigation */}
        <div
          className={`lg:w-64 bg-white lg:bg-transparent rounded-xl lg:rounded-none shadow-sm lg:shadow-none border lg:border-none border-gray-200 lg:sticky lg:top-4 transform transition-transform duration-300 ease-in-out ${
            isNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } fixed inset-y-0 left-0 z-40 lg:static w-64 p-4 lg:p-0`}
        >
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsNavOpen(false); // Close menu on tab click (mobile)
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2 text-sm sm:text-base font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-base sm:text-lg">{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 mt-4 lg:mt-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 sm:space-y-8">
            {/* Basic Info Tab */}
            {activeTab === 'basic' && (
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Informações Básicas</h2>
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Título da Página
                    </label>
                    <input
                      {...register('title')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="ex: Checkout do Curso Premium"
                    />
                    {errors.title && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.title.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      URL da Página
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                      <span className="text-gray-500 text-xs sm:text-sm mb-2 sm:mb-0">
                        {window.location.origin}/checkout/
                      </span>
                      <input
                        {...register('slug')}
                        type="text"
                        disabled={checkingSlug}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                        placeholder="curso-premium"
                      />
                    </div>
                    {errors.slug && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.slug.message}</p>
                    )}
                    {checkingSlug && (
                      <p className="mt-1 text-xs sm:text-sm text-gray-500">Verificando disponibilidade do slug...</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Descrição
                    </label>
                    <textarea
                      {...register('description')}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Breve descrição da sua página de checkout"
                    />
                    {errors.description && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.description.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      URL do Logo (opcional)
                    </label>
                    <input
                      {...register('logo_url')}
                      type="url"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="https://example.com/logo.png"
                    />
                    {errors.logo_url && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.logo_url.message}</p>
                    )}
                    {watch('logo_url') && (
                      <div className="mt-2">
                        <img
                          src={watch('logo_url')}
                          alt="Logo Preview"
                          className="h-12 sm:h-16 w-auto rounded-lg"
                          onError={() => toast.error('URL do logo inválida')}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        {...register('is_active')}
                        type="checkbox"
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-xs sm:text-sm font-medium text-gray-700">Página Ativa</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Theme Tab */}
            {activeTab === 'theme' && (
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Personalização do Tema</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Cor Primária
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.primary_color}
                        onChange={(e) => setTheme({ ...theme, primary_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-gray-300 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.primary_color}
                        onChange={(e) => setTheme({ ...theme, primary_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Cor Secundária
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.secondary_color}
                        onChange={(e) => setTheme({ ...theme, secondary_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-gray-300 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.secondary_color}
                        onChange={(e) => setTheme({ ...theme, secondary_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Cor de Fundo
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.background_color}
                        onChange={(e) => setTheme({ ...theme, background_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-gray-300 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.background_color}
                        onChange={(e) => setTheme({ ...theme, background_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Cor do Texto
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.text_color}
                        onChange={(e) => setTheme({ ...theme, text_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-gray-300 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.text_color}
                        onChange={(e) => setTheme({ ...theme, text_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Família da Fonte
                    </label>
                    <select
                      value={theme.font_family}
                      onChange={(e) => setTheme({ ...theme, font_family: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Inter">Inter</option>
                      <option value="Poppins">Poppins</option>
                      <option value="Roboto">Roboto</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Lato">Lato</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Estilo do Botão
                    </label>
                    <select
                      value={theme.button_style}
                      onChange={(e) => setTheme({ ...theme, button_style: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="rounded">Arredondado</option>
                      <option value="square">Quadrado</option>
                      <option value="pill">Pílula</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Raio da Borda
                    </label>
                    <select
                      value={theme.border_radius}
                      onChange={(e) => setTheme({ ...theme, border_radius: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="0px">Nenhum</option>
                      <option value="4px">Pequeno</option>
                      <option value="8px">Médio</option>
                      <option value="12px">Grande</option>
                      <option value="16px">Extra Grande</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Fields Tab */}
            {activeTab === 'fields' && (
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-4">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Campos Personalizados</h2>
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Adicionar Campo</span>
                  </button>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">Campos Padrão (Sempre Incluídos)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                      <div>• Nome Completo</div>
                      <div>• Endereço de Email</div>
                      <div>• Número de Telefone</div>
                      <div>• CPF</div>
                    </div>
                  </div>

                  {customFields.map((field, index) => (
                    <div key={field.id} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Nome do Campo
                          </label>
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) =>
                              updateCustomField(index, {
                                name: e.target.value.toLowerCase().replace(/\s/g, '_'),
                                label: field.label || e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Rótulo do Campo
                          </label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateCustomField(index, { label: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Tipo do Campo
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) => updateCustomField(index, { type: e.target.value as any })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="text">Texto</option>
                            <option value="email">Email</option>
                            <option value="phone">Telefone</option>
                            <option value="select">Seleção</option>
                            <option value="textarea">Área de Texto</option>
                            <option value="checkbox">Caixa de Seleção</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Texto de Exemplo
                          </label>
                          <input
                            type="text"
                            value={field.placeholder || ''}
                            onChange={(e) => updateCustomField(index, { placeholder: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Digite o texto de exemplo..."
                          />
                        </div>

                        <div className="flex items-end space-x-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateCustomField(index, { required: e.target.checked })}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-xs sm:text-sm text-gray-700">Obrigatório</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeCustomField(index)}
                            className="p-2 text-red-600 hover:text-red-700 transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {field.type === 'select' && (
                        <div className="mt-3 sm:mt-4">
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Opções (separadas por vírgula)
                          </label>
                          <input
                            type="text"
                            value={field.options?.join(', ') || ''}
                            onChange={(e) =>
                              updateCustomField(index, {
                                options: e.target.value.split(',').map((opt) => opt.trim()).filter((opt) => opt),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Opção 1, Opção 2, Opção 3"
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {customFields.length === 0 && (
                    <div className="text-center py-6 sm:py-8 text-gray-500">
                      <p className="text-sm sm:text-base">Nenhum campo personalizado adicionado ainda.</p>
                      <p className="text-xs sm:text-sm">Clique em "Adicionar Campo" para criar campos de formulário adicionais.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-4">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Produtos</h2>
                  <button
                    type="button"
                    onClick={addProduct}
                    className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Adicionar Produto</span>
                  </button>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  {products.map((product, index) => (
                    <div key={product.id} className="border border-gray-200 rounded-lg p-3 sm:p-6">
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <h3 className="font-medium text-sm sm:text-base text-gray-900">Produto {index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeProduct(index)}
                          className="p-2 text-red-600 hover:text-red-700 transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Nome do Produto
                          </label>
                          <input
                            type="text"
                            value={product.name}
                            onChange={(e) => updateProduct(index, { name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Nome do produto"
                          />
                        </div>

                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Preço (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={product.price}
                            onChange={(e) => updateProduct(index, { price: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="0.00"
                          />
                        </div>

                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Tipo do Produto
                          </label>
                          <select
                            value={product.type}
                            onChange={(e) =>
                              updateProduct(index, {
                                type: e.target.value as 'digital' | 'physical',
                                requires_shipping: e.target.value === 'physical',
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="digital">Produto Digital</option>
                            <option value="physical">Produto Físico</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            URL da Imagem (opcional)
                          </label>
                          <input
                            type="url"
                            value={product.image_url || ''}
                            onChange={(e) => updateProduct(index, { image_url: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="https://example.com/image.jpg"
                          />
                          {product.image_url && (
                            <div className="mt-2">
                              <img
                                src={product.image_url}
                                alt="Product Preview"
                                className="h-12 sm:h-16 w-auto rounded-lg"
                                onError={() => toast.error(`URL da imagem inválida para ${product.name}`)}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 sm:mt-4">
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                          Descrição
                        </label>
                        <textarea
                          value={product.description}
                          onChange={(e) => updateProduct(index, { description: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Descrição do produto..."
                        />
                      </div>

                      {product.type === 'digital' && (
                        <div className="mt-3 sm:mt-4">
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            URL do Arquivo Digital
                          </label>
                          <input
                            type="url"
                            value={product.digital_file_url || ''}
                            onChange={(e) => updateProduct(index, { digital_file_url: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="https://example.com/file.pdf"
                          />
                        </div>
                      )}

                      <div className="mt-3 sm:mt-4">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={product.is_active}
                            onChange={(e) => updateProduct(index, { is_active: e.target.checked })}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="ml-2 text-xs sm:text-sm text-gray-700">Produto Ativo</span>
                        </label>
                      </div>
                    </div>
                  ))}

                  {products.length === 0 && (
                    <div className="text-center py-6 sm:py-8 text-gray-500">
                      <p className="text-sm sm:text-base">Nenhum produto adicionado ainda.</p>
                      <p className="text-xs sm:text-sm">Clique em "Adicionar Produto" para começar a vender.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Preview Tab */}
            {activeTab === 'preview' && (
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Visualização</h2>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-600">
                    Visualização: {window.location.origin}/checkout/{watch('slug') || 'sua-url'}
                  </div>
                  <div
                    className="p-4 sm:p-8 min-h-[400px]"
                    style={{
                      backgroundColor: theme.background_color,
                      fontFamily: theme.font_family,
                      color: theme.text_color,
                    }}
                  >
                    <div className="max-w-md mx-auto">
                      <div className="text-center mb-6 sm:mb-8">
                        {watch('logo_url') && (
                          <img
                            src={watch('logo_url')}
                            alt="Logo"
                            className="h-10 sm:h-12 mx-auto mb-3 sm:mb-4 rounded-lg"
                            onError={() => toast.error('URL do logo inválida')}
                          />
                        )}
                        <h1 className="text-xl sm:text-2xl font-bold mb-2">
                          {watch('title') || 'Sua Página de Checkout'}
                        </h1>
                        {watch('description') && (
                          <p className="text-sm sm:text-base text-gray-600">{watch('description')}</p>
                        )}
                      </div>

                      {products.length > 0 && (
                        <div className="mb-6 sm:mb-8">
                          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Produtos</h2>
                          <div className="space-y-4">
                            {products
                              .filter((product) => product.is_active)
                              .map((product) => (
                                <div key={product.id} className="border rounded-lg p-3 sm:p-4">
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                                    <div className="flex items-start space-x-3 sm:space-x-4">
                                      {product.image_url && (
                                        <img
                                          src={product.image_url}
                                          alt={product.name}
                                          className="h-10 w-10 sm:h-12 sm:w-12 object-cover rounded"
                                          onError={() => toast.error(`URL da imagem inválida para ${product.name}`)}
                                        />
                                      )}
                                      <div>
                                        <h3 className="font-medium text-sm sm:text-base">{product.name}</h3>
                                        <p className="text-xs sm:text-sm text-gray-600">{product.description}</p>
                                      </div>
                                    </div>
                                    <span className="font-bold text-sm sm:text-base mt-2 sm:mt-0">
                                      R${product.price.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <h2 className="text-base sm:text-lg font-semibold">Informações do Cliente</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <input
                            type="text"
                            placeholder="Nome Completo"
                            className="px-3 py-2 border border-gray-300 rounded-lg"
                            style={{ borderRadius: theme.border_radius }}
                          />
                          <input
                            type="email"
                            placeholder="Endereço de Email"
                            className="px-3 py-2 border border-gray-300 rounded-lg"
                            style={{ borderRadius: theme.border_radius }}
                          />
                          <input
                            type="tel"
                            placeholder="Número de Telefone"
                            className="px-3 py-2 border border-gray-300 rounded-lg"
                            style={{ borderRadius: theme.border_radius }}
                          />
                          <input
                            type="text"
                            placeholder="CPF"
                            className="px-3 py-2 border border-gray-300 rounded-lg"
                            style={{ borderRadius: theme.border_radius }}
                          />
                        </div>

                        {customFields.map((field) => (
                          <div key={field.id}>
                            {field.type === 'textarea' ? (
                              <textarea
                                placeholder={field.placeholder || field.label}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                style={{ borderRadius: theme.border_radius }}
                                rows={3}
                              />
                            ) : field.type === 'select' ? (
                              <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                style={{ borderRadius: theme.border_radius }}
                              >
                                <option value="">{field.placeholder || field.label}</option>
                                {field.options?.map((option, idx) => (
                                  <option key={idx} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : field.type === 'checkbox' ? (
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="ml-2 text-xs sm:text-sm">{field.label}</span>
                              </label>
                            ) : (
                              <input
                                type={field.type}
                                placeholder={field.placeholder || field.label}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                style={{ borderRadius: theme.border_radius }}
                              />
                            )}
                          </div>
                        ))}

                        <button
                          type="button"
                          className={`w-full py-2 sm:py-3 px-3 sm:px-4 text-white font-medium text-sm sm:text-base transition-colors ${
                            theme.button_style === 'pill'
                              ? 'rounded-full'
                              : theme.button_style === 'square'
                              ? 'rounded-none'
                              : 'rounded-lg'
                          }`}
                          style={{
                            backgroundColor: theme.primary_color,
                            borderRadius:
                              theme.button_style === 'pill'
                                ? '9999px'
                                : theme.button_style === 'square'
                                ? '0'
                                : theme.border_radius,
                          }}
                        >
                          Finalizar Compra
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-4 sm:pt-6 border-t border-gray-200 gap-4">
              <button
                type="button"
                onClick={() => navigate('/checkout-pages')}
                className="px-3 sm:px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors text-sm sm:text-base"
              >
                Cancelar
              </button>
              <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
                >
                  <EyeIcon className="h-4 w-4" />
                  <span>Visualizar</span>
                </button>
                <button
                  type="submit"
                  disabled={checkingSlug}
                  className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 text-sm sm:text-base"
                >
                  <BookmarkIcon className="h-4 w-4" />
                  <span>{isEditing ? 'Atualizar Página' : 'Criar Página'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Utility to debounce a function
function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}