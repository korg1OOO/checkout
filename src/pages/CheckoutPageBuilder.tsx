import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { CheckoutPage, CheckoutTheme, CustomField, Product, LayoutElement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { debounce } from '../utils/debounce';

const schema = yup.object({
  title: yup.string().required('Título é obrigatório').max(255, 'Título deve ter no máximo 255 caracteres'),
  slug: yup
    .string()
    .required('URL slug é obrigatório')
    .matches(/^[a-z0-9-]+$/, 'Slug só pode conter letras minúsculas, números e hífens')
    .max(100, 'Slug deve ter no máximo 100 caracteres'),
  description: yup.string().max(1000, 'Descrição deve ter no máximo 1000 caracteres').nullable(),
  logo_url: yup
    .string()
    .url('Deve ser uma URL válida')
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  is_active: yup.boolean(),
});

interface FormData {
  title: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
}

type MetricCaptureMethod = 'utmify' | 'facebook_pixel' | 'none';

export default function CheckoutPageBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const isEditing = id !== undefined && id !== 'new';
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
  const [layout, setLayout] = useState<LayoutElement[]>([]);
  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(isEditing);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [userPixels, setUserPixels] = useState<string[]>([]);
  const [userUtmifyKey, setUserUtmifyKey] = useState<string>('');
  const [userDeliveryEmail, setUserDeliveryEmail] = useState<string>('');
  const [globalProducts, setGlobalProducts] = useState<Product[]>([]);
  const [metricCaptureMethod, setMetricCaptureMethod] = useState<MetricCaptureMethod>('none');
  const [selectedPixel, setSelectedPixel] = useState<string>('');

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
  const watchedDescription = watch('description');
  const watchedLogoUrl = watch('logo_url');

  const toolboxItems: LayoutElement[] = React.useMemo(() => [
    { id: 'toolbox-title', type: 'title', content: { text: 'Título da Página', style: { fontSize: '24px', fontWeight: 'bold', align: 'center' } }, order: 0 },
    { id: 'toolbox-description', type: 'description', content: { text: 'Descrição da Página', style: { fontSize: '16px', align: 'center' } }, order: 1 },
    { id: 'toolbox-logo', type: 'logo', content: { url: 'https://example.com/logo.png', style: { align: 'center' } }, order: 2 },
    { id: 'toolbox-text_field', type: 'text_field', content: { placeholder: 'Novo Campo', required: false }, order: 3 },
    { id: 'toolbox-button', type: 'button', content: { text: 'Finalizar Compra', style: { align: 'center' } }, order: 4 },
    { id: 'toolbox-image', type: 'image', content: { url: 'https://example.com/image.jpg', style: { align: 'center' } }, order: 5 },
    { id: 'toolbox-spacer', type: 'spacer', content: { style: { height: '20px' } }, order: 6 },
    { id: 'toolbox-divider', type: 'divider', content: { style: { color: '#e5e7eb' } }, order: 7 },
    { id: 'toolbox-product_list', type: 'product_list', content: {}, order: 8 },
    { id: 'toolbox-customer_info_form', type: 'customer_info_form', content: {}, order: 9 },
  ], []);

  useEffect(() => {
    console.log('Page ID from useParams:', id);
    console.log('Current route:', location.pathname);
    console.log('isEditing:', isEditing);
    if (isEditing && (!id || id === 'undefined')) {
      console.error('Invalid ID detected. Expected route: /checkout-pages/new or /checkout-pages/:id/edit');
      toast.error('ID da página inválido. Redirecionando...');
      navigate('/checkout-pages');
    }
  }, [id, isEditing, navigate, location.pathname]);

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

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

  const checkSlugUniqueness = useCallback(
    debounce(async (slug: string) => {
      if (!slug || isEditing || !user?.id) return;
      setCheckingSlug(true);
      try {
        const { data, error } = await supabase
          .from('checkout_pages')
          .select('id')
          .eq('slug', slug)
          .neq('user_id', user.id)
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
    [user?.id, isEditing, setValue]
  );

  useEffect(() => {
    if (watchedSlug && !isEditing) {
      checkSlugUniqueness(watchedSlug);
    }
  }, [watchedSlug, checkSlugUniqueness, isEditing]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      toast.error('Você precisa estar logado para acessar esta página');
      navigate('/auth');
      return;
    }

    const fetchUserSettings = async () => {
  try {
    // Attempt to fetch pixels
    let pixelsData: any[] | null = [];
    try {
      const { data, error } = await supabase
        .from('user_pixels')
        .select('pixel_id')
        .eq('user_id', user.id);
      if (error) {
        console.warn('Failed to fetch user_pixels:', error.message);
      } else {
        pixelsData = data;
      }
    } catch (error) {
      console.warn('Error accessing user_pixels table:', error);
    }
    setUserPixels(pixelsData?.map(p => p.pixel_id) || []);

    // Attempt to fetch user profile
    let profileData: any = null;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('utmify_key, delivery_email')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.warn('Failed to fetch user_profiles:', error.message);
      } else {
        profileData = data;
      }
    } catch (error) {
      console.warn('Error accessing user_profiles table:', error);
    }
    setUserUtmifyKey(profileData?.utmify_key || '');
    setUserDeliveryEmail(profileData?.delivery_email || '');
  } catch (error) {
    console.error('Error fetching user settings:', error);
    toast.error('Falha ao carregar configurações do usuário. Verifique sua conexão com o banco de dados.');
    setUserPixels([]);
    setUserUtmifyKey('');
    setUserDeliveryEmail('');
  }
};

    fetchUserSettings();

    const fetchGlobalProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setGlobalProducts(data || []);
      } catch (error) {
        console.error('Error fetching global products:', error);
        toast.error('Falha ao carregar produtos');
      }
    };

    fetchGlobalProducts();

    const productsSubscription = supabase
      .channel('global_products_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchGlobalProducts()
      )
      .subscribe();

    if (!isEditing) {
      setLayout([
        { id: `element-${Date.now()}-1`, type: 'title', content: { text: watchedTitle || 'Título da Página', style: { fontSize: '24px', fontWeight: 'bold', align: 'center' } }, order: 0 },
        { id: `element-${Date.now()}-2`, type: 'description', content: { text: watchedDescription || 'Descrição da Página', style: { fontSize: '16px', align: 'center' } }, order: 1 },
        { id: `element-${Date.now()}-3`, type: 'logo', content: { url: watchedLogoUrl || '', style: { align: 'center' } }, order: 2 },
        { id: `element-${Date.now()}-4`, type: 'product_list', content: {}, order: 3 },
        { id: `element-${Date.now()}-5`, type: 'customer_info_form', content: {}, order: 4 },
        { id: `element-${Date.now()}-6`, type: 'button', content: { text: 'Finalizar Compra', style: { align: 'center' } }, order: 5 },
      ]);
      setLoading(false);
      return;
    }

    const fetchPage = async () => {
      try {
        setLoading(true);
        console.log('Fetching page with id:', id, 'for user:', user.id);
        const { data, error } = await supabase
          .from('checkout_pages')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        console.log('Supabase response:', { data, error });
        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('Página não encontrada ou você não tem permissão');
          } else if (error.code === '42501') {
            throw new Error('Permissão negada. Verifique sua política de acesso do banco de dados');
          }
          throw new Error(`Error fetching checkout page: ${error.message} (Code: ${error.code})`);
        }

        if (!data) {
          throw new Error('Página não encontrada');
        }

        const sortedCustomFields = (data.custom_fields || []).map((field: CustomField, index: number) => ({
          ...field,
          order: field.order ?? index,
        })).sort((a: CustomField, b: CustomField) => a.order - b.order);

        const sortedProducts = (data.products || []).map((product: Product, index: number) => ({
          ...product,
          order: product.order ?? index,
        })).sort((a: Product, b: Product) => a.order - b.order);

        const sortedLayout = (data.layout || []).map((element: LayoutElement, index: number) => ({
          ...element,
          order: element.order ?? index,
        })).sort((a: LayoutElement, b: LayoutElement) => a.order - b.order);

        setCheckoutPage(data);
        setTheme(data.theme || theme);
        setCustomFields(sortedCustomFields);
        setProducts(sortedProducts);
        setLayout(sortedLayout);
        if (data.utmify_key) {
          setMetricCaptureMethod('utmify');
          setUserUtmifyKey(data.utmify_key);
        } else if (data.pixels && data.pixels.length > 0) {
          setMetricCaptureMethod('facebook_pixel');
          setSelectedPixel(data.pixels[0] || '');
        } else {
          setMetricCaptureMethod('none');
        }
        reset({
          title: data.title,
          slug: data.slug,
          description: data.description || null,
          logo_url: data.logo_url || null,
          is_active: data.is_active,
        });
      } catch (error: any) {
        console.error('Error fetching page:', error);
        toast.error(error.message || 'Falha ao carregar página de checkout');
        navigate('/checkout-pages');
      } finally {
        setLoading(false);
      }
    };

    fetchPage();

    return () => {
      productsSubscription.unsubscribe();
    };
  }, [id, isEditing, user?.id, navigate, reset, theme]);

  useEffect(() => {
    if (!user?.id || !isEditing || !id) return;

    const subscription = supabase
      .channel(`checkout_page_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'checkout_pages',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log('Real-time update received:', payload);
          if (payload.new.user_id === user.id) {
            const sortedCustomFields = (payload.new.custom_fields || []).map((field: CustomField, index: number) => ({
              ...field,
              order: field.order ?? index,
            })).sort((a: CustomField, b: CustomField) => a.order - b.order);

            const sortedProducts = (payload.new.products || []).map((product: Product, index: number) => ({
              ...product,
              order: product.order ?? index,
            })).sort((a: Product, b: Product) => a.order - b.order);

            const sortedLayout = (payload.new.layout || []).map((element: LayoutElement, index: number) => ({
              ...element,
              order: element.order ?? index,
            })).sort((a: LayoutElement, b: LayoutElement) => a.order - b.order);

            setCheckoutPage(payload.new as CheckoutPage);
            setTheme(payload.new.theme || theme);
            setCustomFields(sortedCustomFields);
            setProducts(sortedProducts);
            setLayout(sortedLayout);
            if (payload.new.utmify_key) {
              setMetricCaptureMethod('utmify');
              setUserUtmifyKey(payload.new.utmify_key);
            } else if (payload.new.pixels && payload.new.pixels.length > 0) {
              setMetricCaptureMethod('facebook_pixel');
              setSelectedPixel(payload.new.pixels[0] || '');
            } else {
              setMetricCaptureMethod('none');
            }
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
        console.log('Subscription status:', status, 'Error:', err);
        if (err) {
          console.error('Subscription error:', err);
          toast.error('Falha ao configurar atualizações em tempo real');
        }
      });

    subscriptionRef.current = subscription;

    return () => {
      console.log('Unsubscribing from channel:', `checkout_page_${id}`);
      subscriptionRef.current?.unsubscribe();
    };
  }, [user?.id, isEditing, id, reset, theme]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;

    if (source.droppableId === 'toolbox' && destination.droppableId === 'layout') {
      const draggedItem = toolboxItems[source.index];
      const newElement: LayoutElement = {
        id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: draggedItem.type,
        content: {
          ...draggedItem.content,
          text: draggedItem.type === 'title' ? watchedTitle || draggedItem.content.text
            : draggedItem.type === 'description' ? watchedDescription || draggedItem.content.text
            : draggedItem.content.text,
          url: draggedItem.type === 'logo' ? watchedLogoUrl || draggedItem.content.url : draggedItem.content.url,
          fieldId: draggedItem.type === 'text_field' ? `field_${customFields.length + 1}` : undefined,
        },
        order: destination.index,
      };

      if (newElement.type === 'text_field') {
        const newField: CustomField = {
          id: newElement.content.fieldId!,
          name: `field_${customFields.length + 1}`,
          label: newElement.content.placeholder || 'Novo Campo',
          type: 'text',
          required: newElement.content.required || false,
          placeholder: newElement.content.placeholder,
          order: customFields.length,
        };
        setCustomFields([...customFields, newField]);
      }

      const newLayout = [...layout];
      newLayout.splice(destination.index, 0, newElement);
      const updatedLayout = newLayout.map((item, index) => ({ ...item, order: index }));
      setLayout(updatedLayout);
      console.log('Updated layout:', updatedLayout);
    } else if (source.droppableId === 'layout' && destination.droppableId === 'layout') {
      const newLayout = [...layout];
      const [movedElement] = newLayout.splice(source.index, 1);
      newLayout.splice(destination.index, 0, movedElement);
      const updatedLayout = newLayout.map((item, index) => ({ ...item, order: index }));
      setLayout(updatedLayout);
      console.log('Reordered layout:', updatedLayout);
    }
  };

  const onDragEndFields = (result: DropResult) => {
    if (!result.destination) return;

    const reorderedFields = Array.from(customFields);
    const [movedField] = reorderedFields.splice(result.source.index, 1);
    reorderedFields.splice(result.destination.index, 0, movedField);

    const updatedFields = reorderedFields.map((field, index) => ({
      ...field,
      order: index,
    }));

    setCustomFields(updatedFields);
  };

  const onDragEndProducts = (result: DropResult) => {
    if (!result.destination) return;

    const reorderedProducts = Array.from(products);
    const [movedProduct] = reorderedProducts.splice(result.source.index, 1);
    reorderedProducts.splice(result.destination.index, 0, movedProduct);

    const updatedProducts = reorderedProducts.map((product, index) => ({
      ...product,
      order: index,
    }));

    setProducts(updatedProducts);
  };

  const onSubmit = async (data: FormData) => {
    if (!user || !user.id) {
      console.error('User object:', user);
      toast.error('Usuário não autenticado ou ID do usuário inválido');
      return;
    }

    if (isEditing && (!id || id === 'undefined')) {
      console.error('Invalid page ID:', id);
      toast.error('ID da página inválido');
      return;
    }

    if (products.length === 0) {
      toast.error('Adicione pelo menos um produto à página');
      return;
    }

    for (const product of products) {
      if (!product.name.trim()) {
        toast.error('Todos os produtos devem ter um nome');
        return;
      }
      if (product.price <= 0) {
        toast.error(`O preço do produto "${product.name}" deve ser maior que zero`);
        return;
      }
      if (product.image_url && !isValidUrl(product.image_url)) {
        toast.error(`URL da imagem inválida para o produto "${product.name}"`);
        return;
      }
      if (product.type === 'digital' && product.digital_file_url && !isValidUrl(product.digital_file_url)) {
        toast.error(`URL do arquivo digital inválida para o produto "${product.name}"`);
        return;
      }
    }

    try {
      const pageData: Partial<CheckoutPage> = {
        title: data.title,
        slug: data.slug,
        description: data.description || undefined,
        logo_url: data.logo_url ? data.logo_url.trim() : undefined,
        theme,
        custom_fields: customFields.map((field) => ({
          ...field,
          options: field.options || undefined,
          placeholder: field.placeholder || undefined,
        })),
        products: products.map((p) => ({
          ...p,
          image_url: p.image_url ? p.image_url.trim() : undefined,
          digital_file_url: p.digital_file_url ? p.digital_file_url.trim() : undefined,
        })),
        layout: layout.map((element) => ({
          ...element,
          content: {
            ...element.content,
            text: element.type === 'title' ? data.title
              : element.type === 'description' ? data.description || element.content.text
              : element.content.text,
            url: element.type === 'logo' ? data.logo_url || element.content.url : element.content.url,
          },
        })),
        is_active: data.is_active,
        user_id: user.id,
        pixels: metricCaptureMethod === 'facebook_pixel' && selectedPixel ? [selectedPixel] : undefined,
        utmify_key: metricCaptureMethod === 'utmify' ? userUtmifyKey || undefined : undefined,
        delivery_email: userDeliveryEmail || undefined,
      };

      console.log('Submitting pageData:', JSON.stringify(pageData, null, 2));

      if (isEditing) {
        const { error } = await supabase
          .from('checkout_pages')
          .update(pageData)
          .eq('id', id)
          .eq('user_id', user.id);

        if (error) {
          console.error('Supabase update error:', JSON.stringify(error, null, 2));
          if (error.code === '22P02') {
            toast.error('ID do usuário inválido. Verifique sua sessão.');
          } else if (error.code === '23505') {
            toast.error('Este slug já está em uso. Escolha outro.');
            setValue('slug', `${data.slug}-${Date.now()}`);
          } else if (error.code === '42501') {
            toast.error('Permissão negada. Verifique sua política de acesso do banco de dados.');
          } else if (error.code === 'PGRST116') {
            toast.error('Página não encontrada ou você não tem permissão para editá-la.');
          } else {
            throw new Error(`Error updating page: ${error.message} (Code: ${error.code})`);
          }
          return;
        }
        toast.success('Página de checkout atualizada!');
      } else {
        const { error } = await supabase
          .from('checkout_pages')
          .insert(pageData);

        if (error) {
          console.error('Supabase insert error:', JSON.stringify(error, null, 2));
          if (error.code === '22P02') {
            toast.error('ID do usuário inválido. Verifique sua sessão.');
          } else if (error.code === '23505') {
            toast.error('Este slug já está em uso. Escolha outro.');
            setValue('slug', `${data.slug}-${Date.now()}`);
          } else if (error.code === '42501') {
            toast.error('Permissão negada. Verifique sua política de acesso do banco de dados.');
          } else {
            throw new Error(`Error creating page: ${error.message} (Code: ${error.code})`);
          }
          return;
        }
        toast.success('Página de checkout criada!');
      }

      navigate('/checkout-pages');
    } catch (error: any) {
      console.error('Error saving page:', error);
      toast.error(`Falha ao salvar página de checkout: ${error.message}`);
    }
  };

  const addCustomField = () => {
    const newField: CustomField = {
      id: `field_${Date.now()}`,
      name: `field_${customFields.length + 1}`,
      label: 'Novo Campo',
      type: 'text',
      required: false,
      placeholder: '',
      order: customFields.length,
    };
    setCustomFields([...customFields, newField]);
  };

  const updateCustomField = (index: number, field: Partial<CustomField>) => {
    const updated = [...customFields];
    updated[index] = { ...updated[index], ...field };
    setCustomFields(updated);
  };

  const removeCustomField = (index: number) => {
    const updatedFields = customFields
      .filter((_, i) => i !== index)
      .map((field, i) => ({ ...field, order: i }));
    setCustomFields(updatedFields);
    setLayout(layout.filter((el) => el.content.fieldId !== customFields[index].id));
  };

  const addFromGlobal = (globalProduct: Product) => {
    if (products.some(p => p.id === globalProduct.id)) {
      toast.error('Produto já adicionado');
      return;
    }

    const newProd: Product = {
      ...globalProduct,
      id: `${globalProduct.id}-page-${Date.now()}`,
      order: products.length,
    };

    setProducts([...products, newProd]);
  };

  const updateProduct = (index: number, product: Partial<Product>) => {
    const updated = [...products];
    const newProduct = {
      ...updated[index],
      ...product,
      image_url: product.image_url ? product.image_url.trim() : updated[index].image_url,
      digital_file_url: product.digital_file_url ? product.digital_file_url.trim() : updated[index].digital_file_url,
      requires_shipping: product.type === 'physical' ? true : product.requires_shipping ?? updated[index].requires_shipping,
    };
    updated[index] = newProduct;
    setProducts(updated);
  };

  const removeProduct = (index: number) => {
    const updatedProducts = products
      .filter((_, i) => i !== index)
      .map((product, i) => ({ ...product, order: i }));
    setProducts(updatedProducts);
  };

  const updateLayoutElement = (index: number, content: LayoutElement['content']) => {
    const updatedLayout = [...layout];
    updatedLayout[index] = { ...updatedLayout[index], content };
    setLayout(updatedLayout);
  };

  const removeLayoutElement = (index: number) => {
    const element = layout[index];
    const updatedLayout = layout
      .filter((_, i) => i !== index)
      .map((el, i) => ({ ...el, order: i }));
    setLayout(updatedLayout);
    if (element.type === 'text_field' && element.content.fieldId) {
      setCustomFields(customFields.filter((field) => field.id !== element.content.fieldId));
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user || !user.id) {
    return (
      <div className="text-center py-12">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Por favor, faça login</h3>
        <p className="text-sm sm:text-base text-gray-600">Você precisa estar logado para criar ou editar páginas de checkout.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'basic', name: 'Informações Básicas', icon: '📝' },
    { id: 'theme', name: 'Tema', icon: '🎨' },
    { id: 'fields', name: 'Campos Personalizados', icon: '📋' },
    { id: 'products', name: 'Produtos', icon: '🛍️' },
    { id: 'metrics', name: 'Captura de Métrica', icon: '📊' },
    { id: 'preview', name: 'Visualizar', icon: '👁️' },
  ];

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[var(--sidebar-bg)] rounded-md shadow-md"
        onClick={() => setIsNavOpen(!isNavOpen)}
      >
        {isNavOpen ? (
          <XMarkIcon className="h-6 w-6 text-[var(--text-color)]" />
        ) : (
          <Bars3Icon className="h-6 w-6 text-[var(--text-color)]" />
        )}
      </button>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-color)]">
          {isEditing ? 'Editar Página de Checkout' : 'Criar Nova Página de Checkout'}
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1">
          {isEditing ? 'Atualize as configurações da sua página de checkout' : 'Configure sua página de checkout personalizada'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:gap-8">
        <div
          className={`lg:w-64 bg-[var(--sidebar-bg)] lg:bg-transparent rounded-xl lg:rounded-none shadow-sm lg:shadow-none border lg:border-none border-[var(--border-color)] lg:sticky lg:top-4 transform transition-transform duration-300 ease-in-out ${
            isNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } fixed inset-y-0 left-0 z-40 lg:static w-64 p-4 lg:p-0`}
        >
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsNavOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2 text-sm sm:text-base font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--active-bg)] text-[var(--active-text)] border border-[var(--border-color)]'
                    : 'text-[var(--text-color)] hover:bg-[var(--border-color)]'
                }`}
              >
                <span className="text-base sm:text-lg">{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 mt-4 lg:mt-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 sm:space-y-8">
            {activeTab === 'basic' && (
              <div className="bg-[var(--sidebar-bg)] rounded-xl p-4 sm:p-6 shadow-sm border border-[var(--border-color)]">
                <h2 className="text-base sm:text-lg font-semibold text-[var(--text-color)] mb-4 sm:mb-6">Informações Básicas</h2>
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Título da Página
                    </label>
                    <input
                      {...register('title')}
                      type="text"
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                      placeholder="ex: Checkout do Curso Premium"
                    />
                    {errors.title && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.title.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      URL da Página
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                      <span className="text-[var(--text-secondary)] text-xs sm:text-sm mb-2 sm:mb-0">
                        {window.location.origin}/checkout/
                      </span>
                      <input
                        {...register('slug')}
                        type="text"
                        disabled={checkingSlug}
                        className="flex-1 px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)] disabled:opacity-50"
                      />
                    </div>
                    {errors.slug && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.slug.message}</p>
                    )}
                    {checkingSlug && (
                      <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">Verificando disponibilidade do slug...</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Descrição
                    </label>
                    <textarea
                      {...register('description')}
                      rows={3}
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                      placeholder="Breve descrição da sua página de checkout"
                    />
                    {errors.description && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.description.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      URL do Logo (opcional)
                    </label>
                    <input
                      {...register('logo_url')}
                      type="url"
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                      placeholder="https://example.com/logo.png"
                    />
                    {errors.logo_url && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.logo_url.message}</p>
                    )}
                    {watch('logo_url') && isValidUrl(watch('logo_url')) && (
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
                        className="rounded border-[var(--border-color)] text-[var(--primary-bg)] focus:ring-[var(--primary-bg)]"
                      />
                      <span className="ml-2 text-xs sm:text-sm font-medium text-[var(--text-color)]">Página Ativa</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'theme' && (
              <div className="bg-[var(--sidebar-bg)] rounded-xl p-4 sm:p-6 shadow-sm border border-[var(--border-color)]">
                <h2 className="text-base sm:text-lg font-semibold text-[var(--text-color)] mb-4 sm:mb-6">Personalização do Tema</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Cor Primária
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.primary_color}
                        onChange={(e) => setTheme({ ...theme, primary_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-[var(--border-color)] rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.primary_color}
                        onChange={(e) => setTheme({ ...theme, primary_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Cor Secundária
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.secondary_color}
                        onChange={(e) => setTheme({ ...theme, secondary_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-[var(--border-color)] rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.secondary_color}
                        onChange={(e) => setTheme({ ...theme, secondary_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Cor de Fundo
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.background_color}
                        onChange={(e) => setTheme({ ...theme, background_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-[var(--border-color)] rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.background_color}
                        onChange={(e) => setTheme({ ...theme, background_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Cor do Texto
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={theme.text_color}
                        onChange={(e) => setTheme({ ...theme, text_color: e.target.value })}
                        className="w-10 h-8 sm:w-12 sm:h-10 border border-[var(--border-color)] rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.text_color}
                        onChange={(e) => setTheme({ ...theme, text_color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Família da Fonte
                    </label>
                    <select
                      value={theme.font_family}
                      onChange={(e) => setTheme({ ...theme, font_family: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                    >
                      <option value="Inter">Inter</option>
                      <option value="Poppins">Poppins</option>
                      <option value="Roboto">Roboto</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Lato">Lato</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Estilo do Botão
                    </label>
                    <select
                      value={theme.button_style}
                      onChange={(e) => setTheme({ ...theme, button_style: e.target.value as any })}
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                    >
                      <option value="rounded">Arredondado</option>
                      <option value="square">Quadrado</option>
                      <option value="pill">Pílula</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Raio da Borda
                    </label>
                    <select
                      value={theme.border_radius}
                      onChange={(e) => setTheme({ ...theme, border_radius: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
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

            {activeTab === 'fields' && (
              <div className="bg-[var(--sidebar-bg)] rounded-xl p-4 sm:p-6 shadow-sm border border-[var(--border-color)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-4">
                  <h2 className="text-base sm:text-lg font-semibold text-[var(--text-color)]">Campos Personalizados</h2>
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="inline-flex items-center space-x-2 bg-[var(--primary-bg)] text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)] transition-colors text-sm"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Adicionar Campo</span>
                  </button>
                </div>

                <DragDropContext onDragEnd={onDragEndFields}>
                  <Droppable droppableId="customFields">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4 sm:space-y-6">
                        <div className="bg-[var(--active-bg)] p-3 sm:p-4 rounded-lg">
                          <h3 className="font-medium text-[var(--text-color)] mb-2 text-sm sm:text-base">Campos Padrão (Sempre Incluídos)</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm text-[var(--text-secondary)]">
                            <div>• Nome Completo</div>
                            <div>• Endereço de Email</div>
                            <div>• Número de Telefone</div>
                            <div>• CPF</div>
                          </div>
                        </div>

                        {customFields.map((field, index) => (
                          <Draggable key={field.id} draggableId={field.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`border border-[var(--border-color)] rounded-lg p-3 sm:p-4 ${
                                  snapshot.isDragging ? 'bg-[var(--active-bg)]' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center space-x-2">
                                    <Bars3Icon className="h-5 w-5 text-[var(--text-secondary)] cursor-move" />
                                    <span className="text-sm font-medium">Campo {index + 1}</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                  <div>
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
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
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      Rótulo do Campo
                                    </label>
                                    <input
                                      type="text"
                                      value={field.label}
                                      onChange={(e) => updateCustomField(index, { label: e.target.value })}
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      Tipo do Campo
                                    </label>
                                    <select
                                      value={field.type}
                                      onChange={(e) => updateCustomField(index, { type: e.target.value as any })}
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
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
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      Texto de Exemplo
                                    </label>
                                    <input
                                      type="text"
                                      value={field.placeholder || ''}
                                      onChange={(e) => updateCustomField(index, { placeholder: e.target.value })}
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                      placeholder="Digite o texto de exemplo..."
                                    />
                                  </div>

                                  <div className="flex items-end space-x-2">
                                    <label className="flex items-center">
                                      <input
                                        type="checkbox"
                                        checked={field.required}
                                        onChange={(e) => updateCustomField(index, { required: e.target.checked })}
                                        className="rounded border-[var(--border-color)] text-[var(--primary-bg)] focus:ring-[var(--primary-bg)]"
                                      />
                                      <span className="ml-2 text-xs sm:text-sm text-[var(--text-color)]">Obrigatório</span>
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
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      Opções (separadas por vírgula)
                                    </label>
                                    <input
                                      type="text"
                                      value={field.options?.join(', ') || ''}
                                      onChange={(e) =>
                                        updateCustomField(index, {
                                          options: e.target.value
                                            .split(',')
                                            .map((opt) => opt.trim())
                                            .filter((opt) => opt),
                                        })
                                      }
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                      placeholder="Opção 1, Opção 2, Opção 3"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                {customFields.length === 0 && (
                  <div className="text-center py-6 sm:py-8 text-[var(--text-secondary)]">
                    <p className="text-sm sm:text-base">Nenhum campo personalizado adicionado ainda.</p>
                    <p className="text-xs sm:text-sm">Clique em "Adicionar Campo" para criar campos de formulário adicionais.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'products' && (
              <div className="bg-[var(--sidebar-bg)] rounded-xl p-4 sm:p-6 shadow-sm border border-[var(--border-color)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-4">
                  <h2 className="text-base sm:text-lg font-semibold text-[var(--text-color)]">Produtos</h2>
                </div>

                <DragDropContext onDragEnd={onDragEndProducts}>
                  <Droppable droppableId="products">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4 sm:space-y-6">
                        {products.map((product, index) => (
                          <Draggable key={product.id} draggableId={product.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`border border-[var(--border-color)] rounded-lg p-3 sm:p-6 ${
                                  snapshot.isDragging ? 'bg-[var(--active-bg)]' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3 sm:mb-4">
                                  <div className="flex items-center space-x-2">
                                    <Bars3Icon className="h-5 w-5 text-[var(--text-secondary)] cursor-move" />
                                    <h3 className="font-medium text-sm sm:text-base text-[var(--text-color)]">Produto {index + 1}</h3>
                                  </div>
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
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      Nome do Produto *
                                    </label>
                                    <input
                                      type="text"
                                      value={product.name}
                                      onChange={(e) => updateProduct(index, { name: e.target.value })}
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                      placeholder="Nome do produto"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      Preço (R$) *
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={product.price}
                                      onChange={(e) => updateProduct(index, { price: parseFloat(e.target.value) || 0 })}
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                      placeholder="0.00"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
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
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                    >
                                      <option value="digital">Produto Digital</option>
                                      <option value="physical">Produto Físico</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      Desconto (%)
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={product.discount || 0}
                                      onChange={(e) => updateProduct(index, { discount: parseFloat(e.target.value) || 0 })}
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                      URL da Imagem (opcional)
                                    </label>
                                    <input
                                      type="url"
                                      value={product.image_url || ''}
                                      onChange={(e) => updateProduct(index, { image_url: e.target.value })}
                                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                      placeholder="https://example.com/image.jpg"
                                    />
                                    {product.image_url && isValidUrl(product.image_url) && (
                                      <div className="mt-2">
                                        <img
                                          src={product.image_url}
                                          alt="Product Preview"
                                          className="h-12 sm:h-16 w-auto rounded-lg"
                                          onError={() => toast.error(`URL da imagem inválida para ${product.name || 'produto'}`)}
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {product.type === 'digital' && (
                                    <div>
                                      <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                        URL do Arquivo Digital (opcional)
                                      </label>
                                      <input
                                        type="url"
                                        value={product.digital_file_url || ''}
                                        onChange={(e) => updateProduct(index, { digital_file_url: e.target.value })}
                                        className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                        placeholder="https://example.com/file.pdf"
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className="mt-3 sm:mt-4">
                                  <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-1">
                                    Descrição
                                  </label>
                                  <textarea
                                    value={product.description}
                                    onChange={(e) => updateProduct(index, { description: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                                    placeholder="Descrição do produto..."
                                  />
                                </div>

                                <div className="mt-3 sm:mt-4">
                                  <label className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={product.is_active}
                                      onChange={(e) => updateProduct(index, { is_active: e.target.checked })}
                                      className="rounded border-[var(--border-color)] text-[var(--primary-bg)] focus:ring-[var(--primary-bg)]"
                                    />
                                    <span className="ml-2 text-xs sm:text-sm text-[var(--text-color)]">Produto Ativo</span>
                                  </label>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                <div className="mt-6">
                  <h3 className="text-sm font-medium mb-2">Adicionar Produtos Existentes</h3>
                  <div className="space-y-2">
                    {globalProducts.map((gp) => (
                      <div key={gp.id} className="flex items-center justify-between p-2 border rounded">
                        <span>{gp.name}</span>
                        <button
                          onClick={() => addFromGlobal(gp)}
                          className="text-indigo-600 hover:text-indigo-700"
                        >
                          Adicionar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {products.length === 0 && (
                  <div className="text-center py-6 sm:py-8 text-[var(--text-secondary)]">
                    <p className="text-sm sm:text-base">Nenhum produto adicionado ainda.</p>
                    <p className="text-xs sm:text-sm">Adicione produtos existentes acima.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'metrics' && (
              <div className="bg-[var(--sidebar-bg)] rounded-xl p-4 sm:p-6 shadow-sm border border-[var(--border-color)]">
                <h2 className="text-base sm:text-lg font-semibold text-[var(--text-color)] mb-4 sm:mb-6">
                  Captura de Métrica
                </h2>
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                      Método de Captura de Métrica
                    </label>
                    <select
                      value={metricCaptureMethod}
                      onChange={(e) => {
                        setMetricCaptureMethod(e.target.value as MetricCaptureMethod);
                        if (e.target.value !== 'facebook_pixel') {
                          setSelectedPixel('');
                        }
                      }}
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                    >
                      <option value="none">Nenhum</option>
                      <option value="utmify">Utmify</option>
                      <option value="facebook_pixel">Facebook Pixel</option>
                    </select>
                  </div>

                  {metricCaptureMethod === 'utmify' && (
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                        Chave Utmify
                      </label>
                      <input
                        type="text"
                        value={userUtmifyKey}
                        onChange={(e) => setUserUtmifyKey(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                        placeholder="Digite sua chave Utmify"
                      />
                      {!userUtmifyKey && (
                        <p className="mt-1 text-xs sm:text-sm text-red-600">
                          Por favor, adicione uma chave Utmify nas configurações para usar esta opção.
                        </p>
                      )}
                    </div>
                  )}

                  {metricCaptureMethod === 'facebook_pixel' && (
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-[var(--text-color)] mb-2">
                        Selecionar Pixel do Facebook
                      </label>
                      {userPixels.length > 0 ? (
                        <select
                          value={selectedPixel}
                          onChange={(e) => setSelectedPixel(e.target.value)}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-bg)]"
                        >
                          <option value="">Selecione um pixel</option>
                          {userPixels.map((pixel) => (
                            <option key={pixel} value={pixel}>
                              {pixel}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs sm:text-sm text-red-600">
                          Nenhum pixel do Facebook configurado. Adicione um pixel nas configurações.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="bg-[var(--sidebar-bg)] rounded-xl p-4 sm:p-6 shadow-sm border border-[var(--border-color)]">
                <h2 className="text-base sm:text-lg font-semibold text-[var(--text-color)] mb-4 sm:mb-6">Visualização</h2>
                <DragDropContext onDragEnd={onDragEnd}>
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="w-full lg:w-1/4 bg-[var(--active-bg)] p-4 rounded-lg">
                      <h3 className="text-sm font-medium text-[var(--text-color)] mb-4">
                        Elementos
                      </h3>
                      <Droppable droppableId="toolbox" isDropDisabled={true}>
                        {(provided, snapshot) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={`space-y-2 min-h-[200px] ${snapshot.isDraggingOver ? 'bg-[var(--border-color)]' : ''}`}
                          >
                            {toolboxItems.length === 0 && (
                              <p className="text-sm text-[var(--text-secondary)]">Nenhum elemento disponível.</p>
                            )}
                            {toolboxItems.map((item, index) => (
                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`p-3 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-lg flex items-center space-x-2 cursor-move ${
                                      snapshot.isDragging ? 'bg-[var(--active-bg)] shadow-lg' : 'hover:bg-[var(--border-color)]'
                                    }`}
                                  >
                                    <Bars3Icon className="h-5 w-5 text-[var(--text-secondary)]" />
                                    <span className="text-sm text-[var(--text-color)]">
                                      {item.type === 'title' ? 'Título'
                                        : item.type === 'description' ? 'Descrição'
                                        : item.type === 'logo' ? 'Logo'
                                        : item.type === 'text_field' ? 'Campo de Texto'
                                        : item.type === 'button' ? 'Botão'
                                        : item.type === 'image' ? 'Imagem'
                                        : item.type === 'spacer' ? 'Espaçador'
                                        : item.type === 'divider' ? 'Divisor'
                                        : item.type === 'product_list' ? 'Lista de Produtos'
                                        : 'Formulário de Cliente'}
                                    </span>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>

                                        <div className="flex-1 border rounded-lg overflow-hidden preview-area" style={{ border: '1px solid #d1d5db' }}>
                      <div style={{ backgroundColor: '#f9fafb', padding: '0.5rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        Visualização: {window.location.origin}/checkout/{watch('slug') || 'sua-url'}
                      </div>
                      <Droppable droppableId="layout">
                        {(provided, snapshot) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="p-4 sm:p-8 min-h-[400px]"
                            style={{
                              borderWidth: '2px',
                              borderColor: snapshot.isDraggingOver ? '#3B82F6' : '#d1d5db',
                              backgroundColor: snapshot.isDraggingOver ? '#f9fafb' : theme.background_color,
                              fontFamily: theme.font_family,
                              color: theme.text_color,
                            }}
                          >
                            <div className="max-w-md mx-auto space-y-4">
                              {layout.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#6b7280', paddingTop: '2rem', paddingBottom: '2rem' }}>
                                  <p style={{ fontSize: '0.875rem' }}>Arraste elementos da barra lateral para construir sua página.</p>
                                </div>
                              )}
                              {layout.map((element, index) => (
                                <Draggable key={element.id} draggableId={element.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className="relative group"
                                      style={{
                                        padding: '1rem',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '0.5rem',
                                        backgroundColor: snapshot.isDragging ? '#f9fafb' : '#ffffff',
                                        boxShadow: snapshot.isDragging ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)' : 'none',
                                      }}
                                    >
                                      <div
                                        {...provided.dragHandleProps}
                                        className="absolute top-2 left-2 cursor-move"
                                      >
                                        <Bars3Icon className="h-5 w-5" style={{ color: '#6b7280' }} />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeLayoutElement(index)}
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700 transition-opacity"
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                      {element.type === 'title' && (
                                        <div>
                                          <input
                                            type="text"
                                            value={element.content.text || watchedTitle}
                                            onChange={(e) => updateLayoutElement(index, { ...element.content, text: e.target.value })}
                                            className="w-full"
                                            style={{
                                              fontSize: element.content.style?.fontSize,
                                              fontWeight: element.content.style?.fontWeight,
                                              textAlign: element.content.style?.align,
                                              marginBottom: '0.5rem',
                                            }}
                                          />
                                          <div className="flex space-x-2">
                                            <select
                                              value={element.content.style?.fontSize}
                                              onChange={(e) =>
                                                updateLayoutElement(index, {
                                                  ...element.content,
                                                  style: { ...element.content.style, fontSize: e.target.value },
                                                })
                                              }
                                              style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                                            >
                                              <option value="16px">16px</option>
                                              <option value="20px">20px</option>
                                              <option value="24px">24px</option>
                                              <option value="32px">32px</option>
                                            </select>
                                            <select
                                              value={element.content.style?.align}
                                              onChange={(e) =>
                                                updateLayoutElement(index, {
                                                  ...element.content,
                                                  style: { ...element.content.style, align: e.target.value as any },
                                                })
                                              }
                                              style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                                            >
                                              <option value="left">Esquerda</option>
                                              <option value="center">Centro</option>
                                              <option value="right">Direita</option>
                                            </select>
                                          </div>
                                        </div>
                                      )}
                                      {element.type === 'description' && (
                                        <div>
                                          <textarea
                                            value={element.content.text || watchedDescription}
                                            onChange={(e) => updateLayoutElement(index, { ...element.content, text: e.target.value })}
                                            className="w-full resize-none"
                                            rows={3}
                                            style={{
                                              fontSize: element.content.style?.fontSize,
                                              textAlign: element.content.style?.align,
                                              marginBottom: '0.5rem',
                                            }}
                                          />
                                          <div className="flex space-x-2">
                                            <select
                                              value={element.content.style?.fontSize}
                                              onChange={(e) =>
                                                updateLayoutElement(index, {
                                                  ...element.content,
                                                  style: { ...element.content.style, fontSize: e.target.value },
                                                })
                                              }
                                              style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                                            >
                                              <option value="12px">12px</option>
                                              <option value="14px">14px</option>
                                              <option value="16px">16px</option>
                                              <option value="18px">18px</option>
                                            </select>
                                            <select
                                              value={element.content.style?.align}
                                              onChange={(e) =>
                                                updateLayoutElement(index, {
                                                  ...element.content,
                                                  style: { ...element.content.style, align: e.target.value as any },
                                                })
                                              }
                                              style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                                            >
                                              <option value="left">Esquerda</option>
                                              <option value="center">Centro</option>
                                              <option value="right">Direita</option>
                                            </select>
                                          </div>
                                        </div>
                                      )}
                                      {element.type === 'logo' && (
                                        <div style={{ textAlign: 'center' }}>
                                          <input
                                            type="url"
                                            value={element.content.url || watchedLogoUrl}
                                            onChange={(e) => updateLayoutElement(index, { ...element.content, url: e.target.value })}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', marginBottom: '0.5rem' }}
                                            placeholder="https://example.com/logo.png"
                                          />
                                          {element.content.url && isValidUrl(element.content.url) && (
                                            <img
                                              src={element.content.url}
                                              alt="Logo"
                                              style={{ height: '3rem', margin: '0 auto' }}
                                              onError={() => toast.error('URL do logo inválida')}
                                            />
                                          )}
                                        </div>
                                      )}
                                      {element.type === 'text_field' && (
                                        <div>
                                          <input
                                            type="text"
                                            placeholder={element.content.placeholder}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: theme.border_radius, marginBottom: '0.5rem' }}
                                            onChange={(e) => {
                                              updateLayoutElement(index, { ...element.content, placeholder: e.target.value });
                                              if (element.content.fieldId) {
                                                const fieldIndex = customFields.findIndex((f) => f.id === element.content.fieldId);
                                                if (fieldIndex !== -1) {
                                                  updateCustomField(fieldIndex, { placeholder: e.target.value, label: e.target.value });
                                                }
                                              }
                                            }}
                                          />
                                          <select
                                            value={customFields.find((f) => f.id === element.content.fieldId)?.type || 'text'}
                                            onChange={(e) => {
                                              if (element.content.fieldId) {
                                                const fieldIndex = customFields.findIndex((f) => f.id === element.content.fieldId);
                                                if (fieldIndex !== -1) {
                                                  updateCustomField(fieldIndex, { type: e.target.value as any });
                                                }
                                              }
                                            }}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: theme.border_radius, marginBottom: '0.5rem' }}
                                          >
                                            <option value="text">Texto</option>
                                            <option value="email">Email</option>
                                            <option value="phone">Telefone</option>
                                            <option value="select">Seleção</option>
                                            <option value="textarea">Área de Texto</option>
                                            <option value="checkbox">Caixa de Seleção</option>
                                          </select>
                                          <label className="flex items-center">
                                            <input
                                              type="checkbox"
                                              checked={element.content.required}
                                              onChange={(e) => {
                                                updateLayoutElement(index, { ...element.content, required: e.target.checked });
                                                if (element.content.fieldId) {
                                                  const fieldIndex = customFields.findIndex((f) => f.id === element.content.fieldId);
                                                  if (fieldIndex !== -1) {
                                                    updateCustomField(fieldIndex, { required: e.target.checked });
                                                  }
                                                }
                                              }}
                                              className="rounded"
                                              style={{ borderColor: '#d1d5db' }}
                                            />
                                            <span className="ml-2 text-xs sm:text-sm" style={{ color: '#374151' }}>Obrigatório</span>
                                          </label>
                                        </div>
                                      )}
                                      {element.type === 'button' && (
                                        <div>
                                          <button
                                            type="button"
                                            style={{
                                              width: '100%',
                                              padding: '0.5rem 1rem',
                                              color: 'white',
                                              fontWeight: '500',
                                              backgroundColor: theme.primary_color,
                                              borderRadius:
                                                theme.button_style === 'pill' ? '9999px'
                                                  : theme.button_style === 'square' ? '0'
                                                  : theme.border_radius,
                                              textAlign: element.content.style?.align,
                                            }}
                                          >
                                            <input
                                              type="text"
                                              value={element.content.text}
                                              onChange={(e) => updateLayoutElement(index, { ...element.content, text: e.target.value })}
                                              style={{ width: '100%', background: 'transparent', color: 'white', textAlign: 'center' }}
                                            />
                                          </button>
                                        </div>
                                      )}
                                      {element.type === 'image' && (
                                        <div style={{ textAlign: 'center' }}>
                                          <input
                                            type="url"
                                            value={element.content.url}
                                            onChange={(e) => updateLayoutElement(index, { ...element.content, url: e.target.value })}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', marginBottom: '0.5rem' }}
                                            placeholder="https://example.com/image.jpg"
                                          />
                                          {element.content.url && isValidUrl(element.content.url) && (
                                            <img
                                              src={element.content.url}
                                              alt="Custom Image"
                                              style={{ height: '6rem', margin: '0 auto' }}
                                              onError={() => toast.error('URL da imagem inválida')}
                                            />
                                          )}
                                        </div>
                                      )}
                                      {element.type === 'spacer' && (
                                        <div
                                          style={{
                                            height: element.content.style?.height,
                                            textAlign: element.content.style?.align,
                                          }}
                                        >
                                          <input
                                            type="text"
                                            value={element.content.style?.height}
                                            onChange={(e) =>
                                              updateLayoutElement(index, {
                                                ...element.content,
                                                style: { ...element.content.style, height: e.target.value },
                                              })
                                            }
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                                            placeholder="Altura (ex: 20px)"
                                          />
                                        </div>
                                      )}
                                      {element.type === 'divider' && (
                                        <div>
                                          <hr style={{ borderColor: element.content.style?.color }} />
                                          <input
                                            type="color"
                                            value={element.content.style?.color}
                                            onChange={(e) =>
                                              updateLayoutElement(index, {
                                                ...element.content,
                                                style: { ...element.content.style, color: e.target.value },
                                              })
                                            }
                                            style={{ width: '100%', height: '2rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', marginTop: '0.5rem' }}
                                          />
                                        </div>
                                      )}
                                      {element.type === 'product_list' && (
                                        <div>
                                          <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Produtos</h2>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {products
                                              .filter((product) => product.is_active)
                                              .sort((a, b) => a.order - b.order)
                                              .map((product) => (
                                                <div key={product.id} style={{ border: '1px solid #d1d5db', borderRadius: '0.5rem', padding: '0.75rem' }}>
                                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="flex items-start space-x-3">
                                                      {product.image_url && isValidUrl(product.image_url) && (
                                                        <img
                                                          src={product.image_url}
                                                          alt={product.name}
                                                          className="h-10 w-10 object-cover rounded"
                                                          onError={() => toast.error(`URL da imagem inválida para ${product.name}`)}
                                                        />
                                                      )}
                                                      <div>
                                                        <h3 style={{ fontWeight: '500', fontSize: '0.875rem' }}>{product.name || 'Produto sem nome'}</h3>
                                                        <p style={{ fontSize: '0.75rem', color: '#4b5563' }}>{product.description}</p>
                                                      </div>
                                                    </div>
                                                    <span className="mt-2 sm:mt-0" style={{ fontWeight: '700', fontSize: '0.875rem' }}>
                                                      R${product.price.toFixed(2)}
                                                    </span>
                                                  </div>
                                                </div>
                                              ))}
                                          </div>
                                        </div>
                                      )}
                                      {element.type === 'customer_info_form' && (
                                        <div className="space-y-4">
                                          <h2 style={{ fontSize: '1rem', fontWeight: '600' }}>Informações do Cliente</h2>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <input
                                              type="text"
                                              placeholder="Nome Completo"
                                              className="px-3 py-2 rounded-lg"
                                              style={{ border: '1px solid #d1d5db', borderRadius: theme.border_radius }}
                                            />
                                            <input
                                              type="email"
                                              placeholder="Endereço de Email"
                                              className="px-3 py-2 rounded-lg"
                                              style={{ border: '1px solid #d1d5db', borderRadius: theme.border_radius }}
                                            />
                                            <input
                                              type="tel"
                                              placeholder="Número de Telefone"
                                              className="px-3 py-2 rounded-lg"
                                              style={{ border: '1px solid #d1d5db', borderRadius: theme.border_radius }}
                                            />
                                            <input
                                              type="text"
                                              placeholder="CPF"
                                              className="px-3 py-2 rounded-lg"
                                              style={{ border: '1px solid #d1d5db', borderRadius: theme.border_radius }}
                                            />
                                          </div>
                                          {customFields
                                            .sort((a, b) => a.order - b.order)
                                            .map((field) => (
                                              <div key={field.id}>
                                                {field.type === 'textarea' ? (
                                                  <textarea
                                                    placeholder={field.placeholder || field.label}
                                                    className="w-full px-3 py-2 rounded-lg"
                                                    style={{ border: '1px solid #d1d5db', borderRadius: theme.border_radius }}
                                                    rows={3}
                                                  />
                                                ) : field.type === 'select' ? (
                                                  <select
                                                    className="w-full px-3 py-2 rounded-lg"
                                                    style={{ border: '1px solid #d1d5db', borderRadius: theme.border_radius }}
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
                                                      className="rounded"
                                                      style={{ borderColor: '#d1d5db' }}
                                                    />
                                                    <span className="ml-2 text-xs sm:text-sm" style={{ color: '#374151' }}>{field.label}</span>
                                                  </label>
                                                ) : (
                                                  <input
                                                    type={field.type}
                                                    placeholder={field.placeholder || field.label}
                                                    className="w-full px-3 py-2 rounded-lg"
                                                    style={{ border: '1px solid #d1d5db', borderRadius: theme.border_radius }}
                                                  />
                                                )}
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          </div>
                        )}
                      </Droppable>
                    </div>
                  </div>
                </DragDropContext>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <button
                type="button"
                onClick={() => navigate(`/checkout/${watch('slug')}`)}
                className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 border border-[var(--border-color)] text-[var(--text-color)] rounded-lg hover:bg-[var(--border-color)] transition-colors text-sm sm:text-base"
              >
                <EyeIcon className="h-4 w-4" />
                <span>Testar Link</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 border border-[var(--border-color)] text-[var(--text-color)] rounded-lg hover:bg-[var(--border-color)] transition-colors text-sm sm:text-base"
              >
                <EyeIcon className="h-4 w-4" />
                <span>Visualizar</span>
              </button>
              <button
                type="submit"
                disabled={checkingSlug}
                className="inline-flex items-center space-x-2 bg-[var(--primary-bg)] text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-[var(--primary-hover)] transition-colors disabled:bg-gray-400 text-sm sm:text-base"
              >
                <BookmarkIcon className="h-4 w-4" />
                <span>{isEditing ? 'Atualizar Página' : 'Criar Página'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}