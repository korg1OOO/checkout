// src/pages/CheckoutPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { CheckoutPage as CheckoutPageType, CustomerInfo, Product } from '../types';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const schema = yup.object({
  name: yup.string().required('Nome é obrigatório'),
  email: yup.string().email('Email inválido').required('Email é obrigatório'),
  phone: yup.string().required('Telefone é obrigatório'),
  cpf: yup.string().required('CPF é obrigatório'),
  address_street: yup.string().when('requiresShipping', {
    is: true,
    then: (schema) => schema.required('Endereço é obrigatório'),
    otherwise: (schema) => schema.notRequired(),
  }),
  address_number: yup.string().when('requiresShipping', {
    is: true,
    then: (schema) => schema.required('Número é obrigatório'),
    otherwise: (schema) => schema.notRequired(),
  }),
  address_neighborhood: yup.string().when('requiresShipping', {
    is: true,
    then: (schema) => schema.required('Bairro é obrigatório'),
    otherwise: (schema) => schema.notRequired(),
  }),
  address_city: yup.string().when('requiresShipping', {
    is: true,
    then: (schema) => schema.required('Cidade é obrigatória'),
    otherwise: (schema) => schema.notRequired(),
  }),
  address_state: yup.string().when('requiresShipping', {
    is: true,
    then: (schema) => schema.required('Estado é obrigatório'),
    otherwise: (schema) => schema.notRequired(),
  }),
  address_zip: yup.string().when('requiresShipping', {
    is: true,
    then: (schema) => schema.required('CEP é obrigatório'),
    otherwise: (schema) => schema.notRequired(),
  }),
});

interface FormData {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  [key: string]: any;
}

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const [checkoutPage, setCheckoutPage] = useState<CheckoutPageType | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    context: { requiresShipping: checkoutPage?.products.some((p) => p.requires_shipping && selectedProducts.includes(p.id)) },
  });

  useEffect(() => {
    const fetchCheckoutPage = async () => {
      if (!slug) {
        toast.error('Slug da página inválido');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('checkout_pages')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (error) {
          throw new Error(`Erro ao buscar página: ${error.message} (Code: ${error.code})`);
        }

        if (!data) {
          throw new Error('Página não encontrada ou não está ativa');
        }

        setCheckoutPage(data);
        setSelectedProducts(data.products.filter((p: Product) => p.is_active).map((p: Product) => p.id).slice(0, 1));
        setQuantities(
          data.products.filter((p: Product) => p.is_active).reduce((acc: Record<string, number>, p: Product) => {
            acc[p.id] = 1;
            return acc;
          }, {})
        );
      } catch (error: any) {
        console.error('Error fetching checkout page:', error);
        toast.error(error.message || 'Falha ao carregar página de checkout');
      } finally {
        setLoading(false);
      }
    };

    fetchCheckoutPage();
  }, [slug]);

  const onSubmit = async (data: FormData) => {
    if (selectedProducts.length === 0) {
      toast.error('Por favor, selecione pelo menos um produto');
      return;
    }

    try {
      const customerInfo: CustomerInfo = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        cpf: data.cpf,
        custom_fields: {},
        ...(requiresShipping && {
          address: {
            street: data.address_street!,
            number: data.address_number!,
            complement: data.address_complement,
            neighborhood: data.address_neighborhood!,
            city: data.address_city!,
            state: data.address_state!,
            zip_code: data.address_zip!,
          },
        }),
      };

      checkoutPage?.custom_fields.forEach((field) => {
        customerInfo.custom_fields[field.name] = data[field.name];
      });

      const orderData = {
        checkout_page_id: checkoutPage?.id,
        customer_info: customerInfo,
        products: selectedProducts.map((productId) => {
          const product = checkoutPage?.products.find((p) => p.id === productId);
          return {
            product_id: productId,
            name: product?.name || '',
            price: product?.price || 0,
            quantity: quantities[productId] || 1,
          };
        }),
        total_amount: calculateTotal(),
      };

      console.log('Order data:', orderData);
      toast.success('Pedido realizado com sucesso! Você receberá um email de confirmação em breve.');
      setSelectedProducts([]);
      setQuantities({});
    } catch (error) {
      console.error('Error processing order:', error);
      toast.error('Falha ao processar pedido. Tente novamente.');
    }
  };

  const toggleProduct = (productId: string) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter((id) => id !== productId));
      const newQuantities = { ...quantities };
      delete newQuantities[productId];
      setQuantities(newQuantities);
    } else {
      setSelectedProducts([...selectedProducts, productId]);
      setQuantities({ ...quantities, [productId]: 1 });
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity > 0) {
      setQuantities({ ...quantities, [productId]: quantity });
    }
  };

  const calculateTotal = () => {
    return selectedProducts.reduce((total, productId) => {
      const product = checkoutPage?.products.find((p) => p.id === productId);
      const quantity = quantities[productId] || 1;
      return total + (product?.price || 0) * quantity;
    }, 0);
  };

  const requiresShipping = checkoutPage?.products.some(
    (p) => selectedProducts.includes(p.id) && p.requires_shipping
  );

  if (loading) {
    return (
      <div
        className="checkout-page min-h-screen flex items-center justify-center"
        style={{
          backgroundColor: '#FFFFFF', // Default white for loading state
          color: '#1F2937', // Default text color (text-gray-900)
          isolation: 'isolate', // Isolate from parent styles
        }}
      >
        <style>
          {`
            .checkout-page {
              background-color: inherit !important;
              color: inherit !important;
            }
            .checkout-page [data-theme="dark"],
            .checkout-page .dark\\:bg-gray-800,
            .checkout-page .dark\\:text-white,
            .checkout-page .dark\\:text-gray-100,
            .checkout-page .dark\\:text-gray-200,
            .checkout-page .dark\\:text-gray-300,
            .checkout-page .dark\\:border-gray-700,
            .checkout-page .dark\\:bg-gray-700,
            .checkout-page .bg-gray-50,
            .checkout-page .bg-white,
            .checkout-page .text-gray-900,
            .checkout-page .text-gray-600,
            .checkout-page .text-gray-500,
            .checkout-page .border-gray-300,
            .checkout-page .border-gray-200 {
              background-color: inherit !important;
              color: inherit !important;
              border-color: inherit !important;
            }
          `}
        </style>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#3B82F6' }}></div>
      </div>
    );
  }

  if (!checkoutPage) {
    return (
      <div
        className="checkout-page min-h-screen flex items-center justify-center"
        style={{
          backgroundColor: '#FFFFFF', // Default white for 404 state
          color: '#1F2937', // Default text color (text-gray-900)
          isolation: 'isolate',
        }}
      >
        <style>
          {`
            .checkout-page {
              background-color: inherit !important;
              color: inherit !important;
            }
            .checkout-page [data-theme="dark"],
            .checkout-page .dark\\:bg-gray-800,
            .checkout-page .dark\\:text-white,
            .checkout-page .dark\\:text-gray-100,
            .checkout-page .dark\\:text-gray-200,
            .checkout-page .dark\\:text-gray-300,
            .checkout-page .dark\\:border-gray-700,
            .checkout-page .dark\\:bg-gray-700,
            .checkout-page .bg-gray-50,
            .checkout-page .bg-white,
            .checkout-page .text-gray-900,
            .checkout-page .text-gray-600,
            .checkout-page .text-gray-500,
            .checkout-page .border-gray-300,
            .checkout-page .border-gray-200 {
              background-color: inherit !important;
              color: inherit !important;
              border-color: inherit !important;
            }
          `}
        </style>
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: '#1F2937' }}>
            Página Não Encontrada
          </h1>
          <p className="text-sm sm:text-base mt-2" style={{ color: '#4B5563' }}>
            A página de checkout que você está procurando não existe ou não está ativa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="checkout-page min-h-screen py-8 px-4 sm:px-6"
      data-theme="light" // Force light theme to prevent dark mode interference
      style={{
        backgroundColor: checkoutPage.theme.background_color,
        fontFamily: checkoutPage.theme.font_family,
        color: checkoutPage.theme.text_color,
        isolation: 'isolate',
      }}
    >
      <style>
        {`
          .checkout-page {
            background-color: ${checkoutPage.theme.background_color} !important;
            color: ${checkoutPage.theme.text_color} !important;
          }
          .checkout-page * {
            --tw-bg-opacity: 1 !important;
            --tw-text-opacity: 1 !important;
          }
          .checkout-page [data-theme="dark"],
          .checkout-page .dark\\:bg-gray-800,
          .checkout-page .dark\\:text-white,
          .checkout-page .dark\\:text-gray-100,
          .checkout-page .dark\\:text-gray-200,
          .checkout-page .dark\\:text-gray-300,
          .checkout-page .dark\\:border-gray-700,
          .checkout-page .dark\\:bg-gray-700,
          .checkout-page .bg-gray-50,
          .checkout-page .bg-white,
          .checkout-page .text-gray-900,
          .checkout-page .text-gray-600,
          .checkout-page .text-gray-500,
          .checkout-page .border-gray-300,
          .checkout-page .border-gray-200,
          .checkout-page .text-indigo-600,
          .checkout-page .bg-indigo-600,
          .checkout-page .border-indigo-500,
          .checkout-page .text-base.font-semibold,
          .checkout-page .font-bold.text-sm,
          .checkout-page .text-sm {
            background-color: inherit !important;
            color: inherit !important;
            border-color: inherit !important;
          }
          .checkout-page .error-text {
            color: #DC2626 !important; /* Retain red for error messages */
          }
          .checkout-page .badge-digital {
            background-color: #DBEAFE !important; /* bg-blue-100 */
            color: #1E40AF !important; /* text-blue-800 */
          }
          .checkout-page .badge-physical {
            background-color: #D1FAE5 !important; /* bg-green-100 */
            color: #065F46 !important; /* text-green-800 */
          }
          .checkout-page .badge-shipping {
            background-color: #FEF3C7 !important; /* bg-orange-100 */
            color: #9A3412 !important; /* text-orange-800 */
          }
          .checkout-page .demo-message {
            background-color: #EFF6FF !important; /* bg-blue-50 */
            border-color: #BFDBFE !important; /* border-blue-200 */
            color: #1E40AF !important; /* text-blue-800 */
          }
        `}
      </style>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          {checkoutPage.logo_url && (
            <img
              src={checkoutPage.logo_url}
              alt="Logo"
              className="h-12 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-lg"
              style={{ borderRadius: checkoutPage.theme.border_radius }}
              onError={() => toast.error('URL do logo inválida')}
            />
          )}
          <h1
            className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4"
            style={{ color: checkoutPage.theme.text_color }}
          >
            {checkoutPage.title}
          </h1>
          {checkoutPage.description && (
            <p
              className="text-base sm:text-lg opacity-80"
              style={{ color: checkoutPage.theme.text_color }}
            >
              {checkoutPage.description}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 sm:space-y-8">
          {/* Products Section */}
          <div
            className="rounded-xl p-4 sm:p-6 shadow-sm border"
            style={{
              backgroundColor: checkoutPage.theme.background_color,
              borderColor: checkoutPage.theme.text_color,
              borderRadius: checkoutPage.theme.border_radius,
            }}
          >
            <h2
              className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6"
              style={{ color: checkoutPage.theme.text_color }}
            >
              Selecionar Produtos
            </h2>
            <div className="space-y-4">
              {checkoutPage.products.filter((p) => p.is_active).map((product) => (
                <div
                  key={product.id}
                  className="border rounded-lg p-3 sm:p-4 cursor-pointer transition-all"
                  style={{
                    borderColor: selectedProducts.includes(product.id)
                      ? checkoutPage.theme.primary_color
                      : checkoutPage.theme.text_color,
                    borderWidth: selectedProducts.includes(product.id) ? '2px' : '1px',
                    borderRadius: checkoutPage.theme.border_radius,
                  }}
                  onClick={() => toggleProduct(product.id)}
                >
                  <div className="flex items-start space-x-3 sm:space-x-4">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      className="mt-1 rounded"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        accentColor: checkoutPage.theme.primary_color,
                      }}
                    />
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg"
                        style={{ borderRadius: checkoutPage.theme.border_radius }}
                        onError={() => toast.error(`URL da imagem inválida para ${product.name}`)}
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3
                            className="font-semibold text-base sm:text-lg"
                            style={{ color: checkoutPage.theme.text_color }}
                          >
                            {product.name}
                          </h3>
                          <p
                            className="text-sm sm:text-base mt-1"
                            style={{ color: checkoutPage.theme.text_color }}
                          >
                            {product.description}
                          </p>
                          <div className="flex flex-wrap items-center space-x-2 mt-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs sm:text-sm font-medium ${
                                product.type === 'digital' ? 'badge-digital' : 'badge-physical'
                              }`}
                            >
                              {product.type === 'digital' ? '📱 Digital' : '📦 Físico'}
                            </span>
                            {product.requires_shipping && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs sm:text-sm font-medium badge-shipping">
                                🚚 Envio Necessário
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right mt-2 sm:mt-0">
                          <span
                            className="text-lg sm:text-2xl font-bold"
                            style={{ color: checkoutPage.theme.primary_color }}
                          >
                            R${product.price.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {selectedProducts.includes(product.id) && (
                        <div className="mt-3 sm:mt-4 flex items-center space-x-2">
                          <label
                            className="text-xs sm:text-sm font-medium"
                            style={{ color: checkoutPage.theme.text_color }}
                          >
                            Quantidade:
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={quantities[product.id] || 1}
                            onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 1)}
                            className="w-16 sm:w-20 px-2 py-1 border rounded focus:outline-none"
                            style={{
                              borderColor: checkoutPage.theme.text_color,
                              borderRadius: checkoutPage.theme.border_radius,
                              backgroundColor: checkoutPage.theme.background_color,
                              color: checkoutPage.theme.text_color,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {checkoutPage.products.filter((p) => p.is_active).length === 0 && (
                <div className="text-center py-6" style={{ color: checkoutPage.theme.text_color }}>
                  <p className="text-sm sm:text-base">Nenhum produto disponível para seleção.</p>
                </div>
              )}
            </div>
            {selectedProducts.length > 0 && (
              <div
                className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t"
                style={{ borderColor: checkoutPage.theme.text_color }}
              >
                <div className="flex justify-between items-center text-lg sm:text-xl font-bold">
                  <span style={{ color: checkoutPage.theme.text_color }}>Total:</span>
                  <span style={{ color: checkoutPage.theme.primary_color }}>
                    R${calculateTotal().toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Customer Information */}
          <div
            className="rounded-xl p-4 sm:p-6 shadow-sm border"
            style={{
              backgroundColor: checkoutPage.theme.background_color,
              borderColor: checkoutPage.theme.text_color,
              borderRadius: checkoutPage.theme.border_radius,
            }}
          >
            <h2
              className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6"
              style={{ color: checkoutPage.theme.text_color }}
            >
              Informações do Cliente
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label
                  className="block text-xs sm:text-sm font-medium mb-2"
                  style={{ color: checkoutPage.theme.text_color }}
                >
                  Nome Completo *
                </label>
                <input
                  {...register('name')}
                  type="text"
                  className="w-full px-3 py-2 border rounded focus:outline-none"
                  style={{
                    borderColor: checkoutPage.theme.text_color,
                    borderRadius: checkoutPage.theme.border_radius,
                    backgroundColor: checkoutPage.theme.background_color,
                    color: checkoutPage.theme.text_color,
                  }}
                  placeholder="Digite seu nome completo"
                />
                {errors.name && (
                  <p className="mt-1 text-xs sm:text-sm error-text">{errors.name.message}</p>
                )}
              </div>
              <div>
                <label
                  className="block text-xs sm:text-sm font-medium mb-2"
                  style={{ color: checkoutPage.theme.text_color }}
                >
                  Endereço de Email *
                </label>
                <input
                  {...register('email')}
                  type="email"
                  className="w-full px-3 py-2 border rounded focus:outline-none"
                  style={{
                    borderColor: checkoutPage.theme.text_color,
                    borderRadius: checkoutPage.theme.border_radius,
                    backgroundColor: checkoutPage.theme.background_color,
                    color: checkoutPage.theme.text_color,
                  }}
                  placeholder="Digite seu email"
                />
                {errors.email && (
                  <p className="mt-1 text-xs sm:text-sm error-text">{errors.email.message}</p>
                )}
              </div>
              <div>
                <label
                  className="block text-xs sm:text-sm font-medium mb-2"
                  style={{ color: checkoutPage.theme.text_color }}
                >
                  Número de Telefone *
                </label>
                <input
                  {...register('phone')}
                  type="tel"
                  className="w-full px-3 py-2 border rounded focus:outline-none"
                  style={{
                    borderColor: checkoutPage.theme.text_color,
                    borderRadius: checkoutPage.theme.border_radius,
                    backgroundColor: checkoutPage.theme.background_color,
                    color: checkoutPage.theme.text_color,
                  }}
                  placeholder="(11) 99999-9999"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs sm:text-sm error-text">{errors.phone.message}</p>
                )}
              </div>
              <div>
                <label
                  className="block text-xs sm:text-sm font-medium mb-2"
                  style={{ color: checkoutPage.theme.text_color }}
                >
                  CPF *
                </label>
                <input
                  {...register('cpf')}
                  type="text"
                  className="w-full px-3 py-2 border rounded focus:outline-none"
                  style={{
                    borderColor: checkoutPage.theme.text_color,
                    borderRadius: checkoutPage.theme.border_radius,
                    backgroundColor: checkoutPage.theme.background_color,
                    color: checkoutPage.theme.text_color,
                  }}
                  placeholder="000.000.000-00"
                />
                {errors.cpf && (
                  <p className="mt-1 text-xs sm:text-sm error-text">{errors.cpf.message}</p>
                )}
              </div>
            </div>

            {/* Custom Fields */}
            {checkoutPage.custom_fields.length > 0 && (
              <div className="mt-4 sm:mt-6 space-y-4">
                {checkoutPage.custom_fields.map((field) => (
                  <div key={field.id}>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      {field.label} {field.required && '*'}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        {...register(field.name, { required: field.required && `${field.label} é obrigatório` })}
                        rows={3}
                        className="w-full px-3 py-2 border rounded focus:outline-none"
                        style={{
                          borderColor: checkoutPage.theme.text_color,
                          borderRadius: checkoutPage.theme.border_radius,
                          backgroundColor: checkoutPage.theme.background_color,
                          color: checkoutPage.theme.text_color,
                        }}
                        placeholder={field.placeholder}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        {...register(field.name, { required: field.required && `${field.label} é obrigatório` })}
                        className="w-full px-3 py-2 border rounded focus:outline-none"
                        style={{
                          borderColor: checkoutPage.theme.text_color,
                          borderRadius: checkoutPage.theme.border_radius,
                          backgroundColor: checkoutPage.theme.background_color,
                          color: checkoutPage.theme.text_color,
                        }}
                      >
                        <option value="">{field.placeholder || `Selecionar ${field.label}`}</option>
                        {field.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'checkbox' ? (
                      <label className="flex items-center">
                        <input
                          {...register(field.name, { required: field.required && `${field.label} é obrigatório` })}
                          type="checkbox"
                          className="rounded"
                          style={{
                            borderColor: checkoutPage.theme.text_color,
                            accentColor: checkoutPage.theme.primary_color,
                          }}
                        />
                        <span
                          className="ml-2 text-xs sm:text-sm"
                          style={{ color: checkoutPage.theme.text_color }}
                        >
                          {field.label}
                        </span>
                      </label>
                    ) : (
                      <input
                        {...register(field.name, { required: field.required && `${field.label} é obrigatório` })}
                        type={field.type}
                        className="w-full px-3 py-2 border rounded focus:outline-none"
                        style={{
                          borderColor: checkoutPage.theme.text_color,
                          borderRadius: checkoutPage.theme.border_radius,
                          backgroundColor: checkoutPage.theme.background_color,
                          color: checkoutPage.theme.text_color,
                        }}
                        placeholder={field.placeholder}
                      />
                    )}
                    {errors[field.name] && (
                      <p className="mt-1 text-xs sm:text-sm error-text">{errors[field.name].message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Shipping Address */}
            {requiresShipping && (
              <div className="mt-6 sm:mt-8">
                <h3
                  className="text-base sm:text-lg font-semibold mb-3 sm:mb-4"
                  style={{ color: checkoutPage.theme.text_color }}
                >
                  Endereço de Entrega
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      Endereço *
                    </label>
                    <input
                      {...register('address_street')}
                      type="text"
                      className="w-full px-3 py-2 border rounded focus:outline-none"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        borderRadius: checkoutPage.theme.border_radius,
                        backgroundColor: checkoutPage.theme.background_color,
                        color: checkoutPage.theme.text_color,
                      }}
                      placeholder="Nome da rua"
                    />
                    {errors.address_street && (
                      <p className="mt-1 text-xs sm:text-sm error-text">{errors.address_street.message}</p>
                    )}
                  </div>
                  <div>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      Número *
                    </label>
                    <input
                      {...register('address_number')}
                      type="text"
                      className="w-full px-3 py-2 border rounded focus:outline-none"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        borderRadius: checkoutPage.theme.border_radius,
                        backgroundColor: checkoutPage.theme.background_color,
                        color: checkoutPage.theme.text_color,
                      }}
                      placeholder="123"
                    />
                    {errors.address_number && (
                      <p className="mt-1 text-xs sm:text-sm error-text">{errors.address_number.message}</p>
                    )}
                  </div>
                  <div>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      Complemento
                    </label>
                    <input
                      {...register('address_complement')}
                      type="text"
                      className="w-full px-3 py-2 border rounded focus:outline-none"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        borderRadius: checkoutPage.theme.border_radius,
                        backgroundColor: checkoutPage.theme.background_color,
                        color: checkoutPage.theme.text_color,
                      }}
                      placeholder="Apto, sala, etc."
                    />
                  </div>
                  <div>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      Bairro *
                    </label>
                    <input
                      {...register('address_neighborhood')}
                      type="text"
                      className="w-full px-3 py-2 border rounded focus:outline-none"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        borderRadius: checkoutPage.theme.border_radius,
                        backgroundColor: checkoutPage.theme.background_color,
                        color: checkoutPage.theme.text_color,
                      }}
                      placeholder="Bairro"
                    />
                    {errors.address_neighborhood && (
                      <p className="mt-1 text-xs sm:text-sm error-text">{errors.address_neighborhood.message}</p>
                    )}
                  </div>
                  <div>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      Cidade *
                    </label>
                    <input
                      {...register('address_city')}
                      type="text"
                      className="w-full px-3 py-2 border rounded focus:outline-none"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        borderRadius: checkoutPage.theme.border_radius,
                        backgroundColor: checkoutPage.theme.background_color,
                        color: checkoutPage.theme.text_color,
                      }}
                      placeholder="Cidade"
                    />
                    {errors.address_city && (
                      <p className="mt-1 text-xs sm:text-sm error-text">{errors.address_city.message}</p>
                    )}
                  </div>
                  <div>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      Estado *
                    </label>
                    <input
                      {...register('address_state')}
                      type="text"
                      className="w-full px-3 py-2 border rounded focus:outline-none"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        borderRadius: checkoutPage.theme.border_radius,
                        backgroundColor: checkoutPage.theme.background_color,
                        color: checkoutPage.theme.text_color,
                      }}
                      placeholder="SP"
                    />
                    {errors.address_state && (
                      <p className="mt-1 text-xs sm:text-sm error-text">{errors.address_state.message}</p>
                    )}
                  </div>
                  <div>
                    <label
                      className="block text-xs sm:text-sm font-medium mb-2"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      CEP *
                    </label>
                    <input
                      {...register('address_zip')}
                      type="text"
                      className="w-full px-3 py-2 border rounded focus:outline-none"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        borderRadius: checkoutPage.theme.border_radius,
                        backgroundColor: checkoutPage.theme.background_color,
                        color: checkoutPage.theme.text_color,
                      }}
                      placeholder="00000-000"
                    />
                    {errors.address_zip && (
                      <p className="mt-1 text-xs sm:text-sm error-text">{errors.address_zip.message}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Section */}
          <div
            className="rounded-xl p-4 sm:p-6 shadow-sm border"
            style={{
              backgroundColor: checkoutPage.theme.background_color,
              borderColor: checkoutPage.theme.text_color,
              borderRadius: checkoutPage.theme.border_radius,
            }}
          >
            <h2
              className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6"
              style={{ color: checkoutPage.theme.text_color }}
            >
              Informações de Pagamento
            </h2>
            <div className="demo-message rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <p className="text-xs sm:text-sm">
                💳 O processamento de pagamento está atualmente em modo demo. Nenhuma cobrança real será feita.
              </p>
            </div>
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label
                  className="block text-xs sm:text-sm font-medium mb-2"
                  style={{ color: checkoutPage.theme.text_color }}
                >
                  Método de Pagamento
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="credit_card"
                      defaultChecked
                      className="mr-2 rounded"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        accentColor: checkoutPage.theme.primary_color,
                      }}
                    />
                    <span
                      className="text-xs sm:text-sm"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      💳 Cartão de Crédito
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="pix"
                      className="mr-2 rounded"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        accentColor: checkoutPage.theme.primary_color,
                      }}
                    />
                    <span
                      className="text-xs sm:text-sm"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      📱 PIX
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="bank_slip"
                      className="mr-2 rounded"
                      style={{
                        borderColor: checkoutPage.theme.text_color,
                        accentColor: checkoutPage.theme.primary_color,
                      }}
                    />
                    <span
                      className="text-xs sm:text-sm"
                      style={{ color: checkoutPage.theme.text_color }}
                    >
                      🧾 Boleto Bancário
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || selectedProducts.length === 0}
            className="w-full py-3 sm:py-4 px-4 sm:px-6 text-white font-semibold text-base sm:text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: checkoutPage.theme.primary_color,
              borderRadius:
                checkoutPage.theme.button_style === 'pill'
                  ? '9999px'
                  : checkoutPage.theme.button_style === 'square'
                  ? '0'
                  : checkoutPage.theme.border_radius,
            }}
          >
            {isSubmitting ? 'Processando...' : `Finalizar Compra - R$${calculateTotal().toFixed(2)}`}
          </button>

          <div
            className="text-center text-xs sm:text-sm mt-4"
            style={{ color: checkoutPage.theme.text_color }}
          >
            <p>🔒 Checkout seguro powered by CheckoutPro</p>
          </div>
        </form>
      </div>
    </div>
  );
}