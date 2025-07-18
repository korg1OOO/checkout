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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!checkoutPage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Página Não Encontrada</h1>
          <p className="text-sm sm:text-base text-gray-600">A página de checkout que você está procurando não existe ou não está ativa.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen py-8 px-4 sm:px-6"
      style={{
        backgroundColor: checkoutPage.theme.background_color,
        fontFamily: checkoutPage.theme.font_family,
        color: checkoutPage.theme.text_color,
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          {checkoutPage.logo_url && (
            <img
              src={checkoutPage.logo_url}
              alt="Logo"
              className="h-12 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-lg"
              onError={() => toast.error('URL do logo inválida')}
            />
          )}
          <h1 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">{checkoutPage.title}</h1>
          {checkoutPage.description && (
            <p className="text-base sm:text-lg opacity-80">{checkoutPage.description}</p>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 sm:space-y-8">
          {/* Products Section */}
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6" style={{ color: checkoutPage.theme.text_color }}>
              Selecionar Produtos
            </h2>
            <div className="space-y-4">
              {checkoutPage.products.filter((p) => p.is_active).map((product) => (
                <div
                  key={product.id}
                  className={`border rounded-lg p-3 sm:p-4 cursor-pointer transition-all ${
                    selectedProducts.includes(product.id)
                      ? 'border-2 shadow-md'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{
                    borderColor: selectedProducts.includes(product.id)
                      ? checkoutPage.theme.primary_color
                      : undefined,
                    borderRadius: checkoutPage.theme.border_radius,
                  }}
                  onClick={() => toggleProduct(product.id)}
                >
                  <div className="flex items-start space-x-3 sm:space-x-4">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      className="mt-1 rounded border-gray-300 focus:ring-2"
                      style={{ accentColor: checkoutPage.theme.primary_color }}
                    />
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg"
                        onError={() => toast.error(`URL da imagem inválida para ${product.name}`)}
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-base sm:text-lg">{product.name}</h3>
                          <p className="text-sm sm:text-base text-gray-600 mt-1">{product.description}</p>
                          <div className="flex flex-wrap items-center space-x-2 mt-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs sm:text-sm font-medium ${
                                product.type === 'digital'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {product.type === 'digital' ? '📱 Digital' : '📦 Físico'}
                            </span>
                            {product.requires_shipping && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs sm:text-sm font-medium bg-orange-100 text-orange-800">
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
                          <label className="text-xs sm:text-sm font-medium">Quantidade:</label>
                          <input
                            type="number"
                            min="1"
                            value={quantities[product.id] || 1}
                            onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 1)}
                            className="w-16 sm:w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {checkoutPage.products.filter((p) => p.is_active).length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <p className="text-sm sm:text-base">Nenhum produto disponível para seleção.</p>
                </div>
              )}
            </div>
            {selectedProducts.length > 0 && (
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                <div className="flex justify-between items-center text-lg sm:text-xl font-bold">
                  <span>Total:</span>
                  <span style={{ color: checkoutPage.theme.primary_color }}>
                    R${calculateTotal().toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Customer Information */}
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6" style={{ color: checkoutPage.theme.text_color }}>
              Informações do Cliente
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Nome Completo *</label>
                <input
                  {...register('name')}
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ borderRadius: checkoutPage.theme.border_radius }}
                  placeholder="Digite seu nome completo"
                />
                {errors.name && (
                  <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Endereço de Email *</label>
                <input
                  {...register('email')}
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ borderRadius: checkoutPage.theme.border_radius }}
                  placeholder="Digite seu email"
                />
                {errors.email && (
                  <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Número de Telefone *</label>
                <input
                  {...register('phone')}
                  type="tel"
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ borderRadius: checkoutPage.theme.border_radius }}
                  placeholder="(11) 99999-9999"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.phone.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">CPF *</label>
                <input
                  {...register('cpf')}
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ borderRadius: checkoutPage.theme.border_radius }}
                  placeholder="000.000.000-00"
                />
                {errors.cpf && (
                  <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.cpf.message}</p>
                )}
              </div>
            </div>

            {/* Custom Fields */}
            {checkoutPage.custom_fields.length > 0 && (
              <div className="mt-4 sm:mt-6 space-y-4">
                {checkoutPage.custom_fields.map((field) => (
                  <div key={field.id}>
                    <label className="block text-xs sm:text-sm font-medium mb-2">
                      {field.label} {field.required && '*'}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        {...register(field.name, { required: field.required && `${field.label} é obrigatório` })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{ borderRadius: checkoutPage.theme.border_radius }}
                        placeholder={field.placeholder}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        {...register(field.name, { required: field.required && `${field.label} é obrigatório` })}
                        className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{ borderRadius: checkoutPage.theme.border_radius }}
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
                          className="rounded border-gray-300 focus:ring-2"
                          style={{ accentColor: checkoutPage.theme.primary_color }}
                        />
                        <span className="ml-2 text-xs sm:text-sm">{field.label}</span>
                      </label>
                    ) : (
                      <input
                        {...register(field.name, { required: field.required && `${field.label} é obrigatório` })}
                        type={field.type}
                        className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{ borderRadius: checkoutPage.theme.border_radius }}
                        placeholder={field.placeholder}
                      />
                    )}
                    {errors[field.name] && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors[field.name].message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Shipping Address */}
            {requiresShipping && (
              <div className="mt-6 sm:mt-8">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Endereço de Entrega</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-2">Endereço *</label>
                    <input
                      {...register('address_street')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderRadius: checkoutPage.theme.border_radius }}
                      placeholder="Nome da rua"
                    />
                    {errors.address_street && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.address_street.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-2">Número *</label>
                    <input
                      {...register('address_number')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderRadius: checkoutPage.theme.border_radius }}
                      placeholder="123"
                    />
                    {errors.address_number && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.address_number.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-2">Complemento</label>
                    <input
                      {...register('address_complement')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderRadius: checkoutPage.theme.border_radius }}
                      placeholder="Apto, sala, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-2">Bairro *</label>
                    <input
                      {...register('address_neighborhood')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderRadius: checkoutPage.theme.border_radius }}
                      placeholder="Bairro"
                    />
                    {errors.address_neighborhood && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.address_neighborhood.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-2">Cidade *</label>
                    <input
                      {...register('address_city')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderRadius: checkoutPage.theme.border_radius }}
                      placeholder="Cidade"
                    />
                    {errors.address_city && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.address_city.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-2">Estado *</label>
                    <input
                      {...register('address_state')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderRadius: checkoutPage.theme.border_radius }}
                      placeholder="SP"
                    />
                    {errors.address_state && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.address_state.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-2">CEP *</label>
                    <input
                      {...register('address_zip')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderRadius: checkoutPage.theme.border_radius }}
                      placeholder="00000-000"
                    />
                    {errors.address_zip && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.address_zip.message}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Section (Unchanged) */}
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6" style={{ color: checkoutPage.theme.text_color }}>
              Informações de Pagamento
            </h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <p className="text-blue-800 text-xs sm:text-sm">
                💳 O processamento de pagamento está atualmente em modo demo. Nenhuma cobrança real será feita.
              </p>
            </div>
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Método de Pagamento</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="credit_card"
                      defaultChecked
                      className="mr-2"
                      style={{ accentColor: checkoutPage.theme.primary_color }}
                    />
                    <span className="text-xs sm:text-sm">💳 Cartão de Crédito</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="pix"
                      className="mr-2"
                      style={{ accentColor: checkoutPage.theme.primary_color }}
                    />
                    <span className="text-xs sm:text-sm">📱 PIX</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="bank_slip"
                      className="mr-2"
                      style={{ accentColor: checkoutPage.theme.primary_color }}
                    />
                    <span className="text-xs sm:text-sm">🧾 Boleto Bancário</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || selectedProducts.length === 0}
            className={`w-full py-3 sm:py-4 px-4 sm:px-6 text-white font-semibold text-base sm:text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              checkoutPage.theme.button_style === 'pill'
                ? 'rounded-full'
                : checkoutPage.theme.button_style === 'square'
                ? 'rounded-none'
                : 'rounded-lg'
            }`}
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

          <div className="text-center text-xs sm:text-sm text-gray-500 mt-4">
            <p>🔒 Checkout seguro powered by CheckoutPro</p>
          </div>
        </form>
      </div>
    </div>
  );
}