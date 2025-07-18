import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { 
  UserIcon, 
  CreditCardIcon, 
  BellIcon,
  ShieldCheckIcon,
  KeyIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const profileSchema = yup.object({
  name: yup.string().required('Name is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  company: yup.string(),
  website: yup.string().url('Must be a valid URL').nullable(),
});

const passwordSchema = yup.object({
  currentPassword: yup.string().required('Current password is required'),
  newPassword: yup.string().min(6, 'Password must be at least 6 characters').required('New password is required'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('newPassword')], 'Passwords must match')
    .required('Confirm password is required'),
});

interface ProfileData {
  name: string;
  email: string;
  company: string;
  website: string;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  const profileForm = useForm<ProfileData>({
    resolver: yupResolver(profileSchema),
    defaultValues: {
      name: user?.user_metadata?.name || '',
      email: user?.email || '',
      company: '',
      website: ''
    }
  });

  const passwordForm = useForm<PasswordData>({
    resolver: yupResolver(passwordSchema),
  });

  const onProfileSubmit = async (data: ProfileData) => {
    try {
      // Mock profile update
      console.log('Updating profile:', data);
      toast.success('Profile updated successfully!');
    } catch (error) {
      toast.error('Failed to update profile');
    }
  };

  const onPasswordSubmit = async (data: PasswordData) => {
    try {
      // Mock password update
      console.log('Updating password');
      toast.success('Password updated successfully!');
      passwordForm.reset();
    } catch (error) {
      toast.error('Failed to update password');
    }
  };

  const tabs = [
    { id: 'profile', name: 'Perfil', icon: UserIcon },
    { id: 'billing', name: 'Cobrança', icon: CreditCardIcon },
    { id: 'notifications', name: 'Notificações', icon: BellIcon },
    { id: 'security', name: 'Segurança', icon: ShieldCheckIcon },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-600 mt-1">Gerencie as configurações da sua conta e preferências</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 text-left rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                <span className="font-medium">{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Informações do Perfil</h2>
              
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nome Completo
                    </label>
                    <input
                      {...profileForm.register('name')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {profileForm.formState.errors.name && (
                      <p className="mt-1 text-sm text-red-600">{profileForm.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Endereço de Email
                    </label>
                    <input
                      {...profileForm.register('email')}
                      type="email"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {profileForm.formState.errors.email && (
                      <p className="mt-1 text-sm text-red-600">{profileForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Empresa (Opcional)
                    </label>
                    <input
                      {...profileForm.register('company')}
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nome da sua empresa"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website (Opcional)
                    </label>
                    <input
                      {...profileForm.register('website')}
                      type="url"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="https://yourwebsite.com"
                    />
                    {profileForm.formState.errors.website && (
                      <p className="mt-1 text-sm text-red-600">{profileForm.formState.errors.website.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Plano Atual</h2>
                
                <div className="border border-indigo-200 rounded-lg p-6 bg-indigo-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-indigo-900">Plano Gratuito</h3>
                      <p className="text-indigo-700 mt-1">Perfeito para começar</p>
                      <ul className="mt-4 space-y-2 text-sm text-indigo-800">
                        <li>• Até 3 páginas de checkout</li>
                        <li>• Personalização básica</li>
                        <li>• Taxa de transação de 5%</li>
                        <li>• Suporte por email</li>
                      </ul>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-indigo-900">R$0</span>
                      <p className="text-indigo-700">/mês</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Opções de Upgrade</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900">Plano Pro</h4>
                      <p className="text-2xl font-bold text-gray-900 mt-2">R$29<span className="text-sm font-normal">/mês</span></p>
                      <ul className="mt-4 space-y-1 text-sm text-gray-600">
                        <li>• Páginas de checkout ilimitadas</li>
                        <li>• Personalização avançada</li>
                        <li>• Taxa de transação de 3%</li>
                        <li>• Suporte prioritário</li>
                      </ul>
                      <button className="w-full mt-4 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                        Upgrade para Pro
                      </button>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900">Empresarial</h4>
                      <p className="text-2xl font-bold text-gray-900 mt-2">R$99<span className="text-sm font-normal">/mês</span></p>
                      <ul className="mt-4 space-y-1 text-sm text-gray-600">
                        <li>• Tudo do Pro</li>
                        <li>• Solução white-label</li>
                        <li>• Taxa de transação de 1%</li>
                        <li>• Suporte dedicado</li>
                      </ul>
                      <button className="w-full mt-4 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition-colors">
                        Contatar Vendas
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Billing History */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Histórico de Cobrança</h2>
                <div className="text-center py-8 text-gray-500">
                  <CreditCardIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Nenhum histórico de cobrança ainda</p>
                  <p className="text-sm">Suas faturas aparecerão aqui quando você fizer upgrade</p>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Preferências de Notificação</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Notificações por Email</h3>
                  <div className="space-y-4">
                    {[
                      { id: 'new_orders', label: 'Novos Pedidos', description: 'Seja notificado quando receber um novo pedido' },
                      { id: 'payment_received', label: 'Pagamento Recebido', description: 'Seja notificado quando pagamentos forem processados' },
                      { id: 'weekly_reports', label: 'Relatórios Semanais', description: 'Receba relatórios semanais de vendas e análises' },
                      { id: 'product_updates', label: 'Atualizações do Produto', description: 'Mantenha-se atualizado com novos recursos e melhorias' }
                    ].map((notification) => (
                      <div key={notification.id} className="flex items-center justify-between py-3">
                        <div>
                          <h4 className="font-medium text-gray-900">{notification.label}</h4>
                          <p className="text-sm text-gray-600">{notification.description}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" defaultChecked className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Notificações Push</h3>
                  <div className="space-y-4">
                    {[
                      { id: 'browser_notifications', label: 'Notificações do Navegador', description: 'Receba notificações no seu navegador' },
                      { id: 'mobile_notifications', label: 'Notificações Mobile', description: 'Receba notificações push em dispositivos móveis' }
                    ].map((notification) => (
                      <div key={notification.id} className="flex items-center justify-between py-3">
                        <div>
                          <h4 className="font-medium text-gray-900">{notification.label}</h4>
                          <p className="text-sm text-gray-600">{notification.description}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-200">
                  <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                    Salvar Preferências
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Change Password */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Alterar Senha</h2>
                
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Senha Atual
                    </label>
                    <input
                      {...passwordForm.register('currentPassword')}
                      type="password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {passwordForm.formState.errors.currentPassword && (
                      <p className="mt-1 text-sm text-red-600">{passwordForm.formState.errors.currentPassword.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nova Senha
                    </label>
                    <input
                      {...passwordForm.register('newPassword')}
                      type="password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {passwordForm.formState.errors.newPassword && (
                      <p className="mt-1 text-sm text-red-600">{passwordForm.formState.errors.newPassword.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirmar Nova Senha
                    </label>
                    <input
                      {...passwordForm.register('confirmPassword')}
                      type="password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="mt-1 text-sm text-red-600">{passwordForm.formState.errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Atualizar Senha
                    </button>
                  </div>
                </form>
              </div>

              {/* Two-Factor Authentication */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Autenticação de Dois Fatores</h2>
                
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <ShieldCheckIcon className="h-8 w-8 text-gray-400" />
                    <div>
                      <h3 className="font-medium text-gray-900">Autenticação de Dois Fatores</h3>
                      <p className="text-sm text-gray-600">Adicione uma camada extra de segurança à sua conta</p>
                    </div>
                  </div>
                  <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                    Ativar 2FA
                  </button>
                </div>
              </div>

              {/* API Keys */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Chaves da API</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <KeyIcon className="h-6 w-6 text-gray-400" />
                      <div>
                        <h3 className="font-medium text-gray-900">Chave da API Webhook</h3>
                        <p className="text-sm text-gray-600">Use esta chave para receber notificações webhook</p>
                      </div>
                    </div>
                    <button className="text-indigo-600 hover:text-indigo-700 font-medium">
                      Gerar Chave
                    </button>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800 text-sm">
                      ⚠️ As chaves da API fornecem acesso à sua conta. Mantenha-as seguras e nunca as compartilhe publicamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}