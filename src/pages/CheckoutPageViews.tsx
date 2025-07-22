// src/components/CheckoutPageView.tsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckoutPage, LayoutElement, CustomField, Product } from '../types';
import toast from 'react-hot-toast';

const CheckoutPageView: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [checkoutPage, setCheckoutPage] = useState<CheckoutPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCheckoutPage = async () => {
      if (!slug) {
        toast.error('Invalid page URL');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('checkout_pages')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true) // Only fetch active pages
          .single();

        if (error || !data) {
          throw new Error('Page not found or inactive');
        }

        setCheckoutPage(data);
      } catch (error) {
        console.error('Error fetching checkout page:', error);
        toast.error('Checkout page not found');
      } finally {
        setLoading(false);
      }
    };

    fetchCheckoutPage();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!checkoutPage) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900">404 - Page Not Found</h1>
        <p className="text-gray-600 mt-2">The checkout page you are looking for does not exist or is inactive.</p>
      </div>
    );
  }

  const { layout, theme, products, custom_fields, title, description, logo_url } = checkoutPage;

  return (
    <div
      className="min-h-screen p-4 sm:p-8"
      style={{
        backgroundColor: theme.background_color,
        fontFamily: theme.font_family,
        color: theme.text_color,
      }}
    >
      <div className="max-w-md mx-auto space-y-6">
        {layout
          .sort((a, b) => a.order - b.order)
          .map((element: LayoutElement) => (
            <div key={element.id}>
              {element.type === 'title' && (
                <h1
                  className="text-2xl font-bold"
                  style={{
                    fontSize: element.content.style?.fontSize,
                    fontWeight: element.content.style?.fontWeight,
                    textAlign: element.content.style?.align,
                  }}
                >
                  {element.content.text || title}
                </h1>
              )}
              {element.type === 'description' && (
                <p
                  className="text-base"
                  style={{
                    fontSize: element.content.style?.fontSize,
                    textAlign: element.content.style?.align,
                  }}
                >
                  {element.content.text || description}
                </p>
              )}
              {element.type === 'logo' && element.content.url && (
                <div className="text-center">
                  <img
                    src={element.content.url}
                    alt="Logo"
                    className="h-16 mx-auto"
                    style={{ textAlign: element.content.style?.align }}
                  />
                </div>
              )}
              {element.type === 'image' && element.content.url && (
                <div className="text-center">
                  <img
                    src={element.content.url}
                    alt="Custom Image"
                    className="h-24 mx-auto"
                    style={{ textAlign: element.content.style?.align }}
                  />
                </div>
              )}
              {element.type === 'spacer' && (
                <div style={{ height: element.content.style?.height }} />
              )}
              {element.type === 'divider' && (
                <hr style={{ borderColor: element.content.style?.color }} />
              )}
              {element.type === 'product_list' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Produtos</h2>
                  {products
                    .filter((p: Product) => p.is_active)
                    .sort((a, b) => a.order - b.order)
                    .map((product: Product) => (
                      <div key={product.id} className="border rounded-lg p-4 flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          {product.image_url && (
                            <img src={product.image_url} alt={product.name} className="h-10 w-10 object-cover rounded" />
                          )}
                          <div>
                            <h3 className="font-medium">{product.name}</h3>
                            <p className="text-sm text-gray-600">{product.description}</p>
                          </div>
                        </div>
                        <span className="font-bold">R${product.price.toFixed(2)}</span>
                      </div>
                    ))}
                </div>
              )}
              {element.type === 'customer_info_form' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Informações do Cliente</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    {custom_fields
                      .sort((a: CustomField, b: CustomField) => a.order - b.order)
                      .map((field: CustomField) => (
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
                              <span className="ml-2 text-sm">{field.label}</span>
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
                  </div>
                </div>
              )}
              {element.type === 'button' && (
                <button
                  type="button"
                  className={`w-full py-2 px-4 text-white font-medium ${
                    theme.button_style === 'pill' ? 'rounded-full' : theme.button_style === 'square' ? 'rounded-none' : 'rounded-lg'
                  }`}
                  style={{
                    backgroundColor: theme.primary_color,
                    borderRadius:
                      theme.button_style === 'pill' ? '9999px' : theme.button_style === 'square' ? '0' : theme.border_radius,
                    textAlign: element.content.style?.align,
                  }}
                >
                  {element.content.text}
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};

export default CheckoutPageView;