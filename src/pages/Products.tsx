import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Dialog, Transition } from '@headlessui/react';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { debounce } from '../utils/debounce'; // Import debounce

const productSchema = yup.object({
  name: yup.string().required('Nome é obrigatório'),
  description: yup.string().nullable(),
  price: yup.number().positive('Preço deve ser positivo').required('Preço é obrigatório'),
  type: yup.string().oneOf(['digital', 'physical'] as const).required('Tipo é obrigatório'),
  image_url: yup.string().url('URL inválida').nullable(),
  digital_file_url: yup.string().url('URL inválida').when('type', {
    is: 'digital',
    then: (schema) => schema.required('URL do arquivo digital é obrigatória para produtos digitais'),
  }),
  discount: yup.number().min(0).max(100).nullable(),
  is_active: yup.boolean(),
});

type ProductFormData = yup.InferType<typeof productSchema>;

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { user } = useAuth();
  const subscriptionRef = useRef<any>(null);

  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<ProductFormData>({
    resolver: yupResolver(productSchema),
  });

  const productType = watch('type');

  const fetchProducts = useCallback(
    debounce(async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(`Error fetching products: ${error.message}`);
        }

        setProducts(data || []);
      } catch (error) {
        console.error('Error fetching products:', error);
        toast.error('Failed to load products');
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

    fetchProducts();

    const subscription = supabase
      .channel('products_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchProducts()
      )
      .subscribe();

    subscriptionRef.current = subscription;

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [user, fetchProducts]);

  const openModal = (product?: Product) => {
    if (product) {
      reset(product);
      setEditingProduct(product);
    } else {
      reset({
        name: '',
        description: null,
        price: 0,
        type: 'digital',
        image_url: null,
        digital_file_url: null,
        discount: null,
        is_active: true,
      });
      setEditingProduct(null);
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (data: ProductFormData) => {
    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(data)
          .eq('id', editingProduct.id)
          .eq('user_id', user?.id);

        if (error) throw error;
        toast.success('Produto atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('products')
          .insert({ ...data, user_id: user?.id });

        if (error) throw error;
        toast.success('Produto criado com sucesso!');
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Falha ao salvar produto');
    }
  };

  const handleDelete = async (productId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este produto?')) {
      try {
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', productId)
          .eq('user_id', user?.id);

        if (error) throw error;
        toast.success('Produto excluído com sucesso!');
        fetchProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        toast.error('Falha ao excluir produto');
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          <p className="text-gray-600 mt-1">
            Gerencie seus produtos
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Novo Produto</span>
        </button>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PlusIcon className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum produto ainda</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Crie seu primeiro produto.
          </p>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Criar Produto</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    product.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {product.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <h3 className="font-medium text-gray-900 mb-2">{product.name}</h3>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{product.description || 'Sem descrição'}</p>
                <p className="text-sm text-gray-600">Preço: R${product.price.toFixed(2)}</p>
                <p className="text-sm text-gray-600">Tipo: {product.type === 'digital' ? 'Digital' : 'Físico'}</p>
                {product.discount && <p className="text-sm text-gray-600">Desconto: {product.discount}%</p>}

                <div className="flex items-center justify-end space-x-2 mt-4">
                  <button
                    onClick={() => openModal(product)}
                    className="p-2 text-indigo-600 hover:text-indigo-700 transition-colors"
                    title="Editar"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="p-2 text-red-600 hover:text-red-700 transition-colors"
                    title="Excluir"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Transition appear show={isModalOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsModalOpen(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={React.Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                  </Dialog.Title>

                  <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Nome</label>
                      <input {...register('name')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                      {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Descrição</label>
                      <textarea {...register('description')} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Preço</label>
                      <input type="number" step="0.01" {...register('price')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                      {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price.message}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tipo</label>
                      <select {...register('type')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                        <option value="digital">Digital</option>
                        <option value="physical">Físico</option>
                      </select>
                      {errors.type && <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">URL da Imagem</label>
                      <input {...register('image_url')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                      {errors.image_url && <p className="mt-1 text-sm text-red-600">{errors.image_url.message}</p>}
                    </div>

                    {productType === 'digital' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">URL do Arquivo Digital</label>
                        <input {...register('digital_file_url')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                        {errors.digital_file_url && <p className="mt-1 text-sm text-red-600">{errors.digital_file_url.message}</p>}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Desconto (%)</label>
                      <input type="number" min="0" max="100" {...register('discount')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                      {errors.discount && <p className="mt-1 text-sm text-red-600">{errors.discount.message}</p>}
                    </div>

                    <div className="flex items-center">
                      <input type="checkbox" {...register('is_active')} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                      <label className="ml-2 block text-sm text-gray-900">Ativo</label>
                    </div>

                    <div className="mt-4 flex justify-end space-x-2">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                        onClick={() => setIsModalOpen(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                      >
                        Salvar
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}