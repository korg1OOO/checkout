import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import {
  UserIcon,
  CreditCardIcon,
  BellIcon,
  ShieldCheckIcon,
  KeyIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

const profileSchema = yup.object({
  name: yup.string().required('Nome é obrigatório'),
  email: yup.string().email('Email inválido').required('Email é obrigatório'),
  company: yup.string().nullable(),
  website: yup.string().url('Deve ser uma URL válida').nullable(),
});

const passwordSchema = yup.object({
  currentPassword: yup.string().required('Senha atual é obrigatória'),
  newPassword: yup.string().min(6, 'A senha deve ter pelo menos 6 caracteres').required('Nova senha é obrigatória'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('newPassword')], 'As senhas devem coincidir')
    .required('Confirmação de senha é obrigatória'),
});

const totpSchema = yup.object({
  totpCode: yup
    .string()
    .matches(/^\d{6}$/, 'O código TOTP deve ser um número de 6 dígitos')
    .required('O código TOTP é obrigatório'),
});

const deliveryEmailSchema = yup.object({
  deliveryEmail: yup.string().email('Email inválido').nullable(),
});

const utmifySchema = yup.object({
  utmifyKey: yup.string().nullable(),
});

interface ProfileData {
  name: string;
  email: string;
  company: string | null;
  website: string | null;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface NotificationPreferences {
  new_orders: boolean;
  payment_received: boolean;
  weekly_reports: boolean;
  product_updates: boolean;
  browser_notifications: boolean;
  mobile_notifications: boolean;
}

export default function Settings() {
  const { user, session, loading, refreshSession } = useAuth();
  const { closeSidebar } = useSidebar();
  const [activeTab, setActiveTab] = useState('profile');
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    new_orders: true,
    payment_received: true,
    weekly_reports: true,
    product_updates: true,
    browser_notifications: false,
    mobile_notifications: false,
  });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [qrCodeUri, setQrCodeUri] = useState<string | null>(null);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [pixels, setPixels] = useState<string[]>([]);
  const [newPixel, setNewPixel] = useState<string>('');
  const [deliveryEmail, setDeliveryEmail] = useState<string>('');
  const [utmifyKey, setUtmifyKey] = useState<string>('');

  const profileForm = useForm<ProfileData>({
    resolver: yupResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
      company: '',
      website: '',
    },
  });

  const passwordForm = useForm<PasswordData>({
    resolver: yupResolver(passwordSchema),
  });

  const totpForm = useForm<{ totpCode: string }>({
    resolver: yupResolver(totpSchema),
  });

  const deliveryEmailForm = useForm<{ deliveryEmail: string }>({
    resolver: yupResolver(deliveryEmailSchema),
    defaultValues: { deliveryEmail: '' },
  });

  const utmifyForm = useForm<{ utmifyKey: string }>({
    resolver: yupResolver(utmifySchema),
    defaultValues: { utmifyKey: '' },
  });

  useEffect(() => {
    if (!user || !session || loading) return;

    const fetchProfileAndPrefs = async () => {
      try {
        const { data: { user: refreshedUser }, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error('User fetch error:', userError);
          throw new Error('Erro ao buscar dados do usuário');
        }

        console.log('Fetched user:', refreshedUser);

        profileForm.setValue('name', refreshedUser?.user_metadata?.name || '');
        profileForm.setValue('email', refreshedUser?.email || '');
        setPendingEmail(refreshedUser?.new_email || null);

        // Fetch or initialize user_profiles with additional fields
        let { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('company, website, delivery_email, utmify_key')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Profile fetch error:', profileError);
          throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
        }

        if (!profileData) {
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({ user_id: user.id, company: null, website: null, delivery_email: null, utmify_key: null });
          if (insertError) {
            console.error('Profile insert error:', insertError);
            throw new Error(`Erro ao criar perfil: ${insertError.message}`);
          }
          profileData = { company: null, website: null, delivery_email: null, utmify_key: null };
        }

        profileForm.setValue('company', profileData.company || '');
        profileForm.setValue('website', profileData.website || '');
        setDeliveryEmail(profileData.delivery_email || '');
        deliveryEmailForm.setValue('deliveryEmail', profileData.delivery_email || '');
        setUtmifyKey(profileData.utmify_key || '');
        utmifyForm.setValue('utmifyKey', profileData.utmify_key || '');

        // Fetch or initialize user_preferences
        let { data: prefsData, error: prefsError } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (prefsError && prefsError.code !== 'PGRST116') {
          console.error('Preferences fetch error:', prefsError);
          throw new Error(`Erro ao buscar preferências: ${prefsError.message}`);
        }

        if (!prefsData) {
          const defaultPrefs = {
            user_id: user.id,
            new_orders: true,
            payment_received: true,
            weekly_reports: true,
            product_updates: true,
            browser_notifications: false,
            mobile_notifications: false,
          };
          const { error: insertError } = await supabase
            .from('user_preferences')
            .insert(defaultPrefs);
          if (insertError) {
            console.error('Preferences insert error:', insertError);
            throw new Error(`Erro ao criar preferências: ${insertError.message}`);
          }
          prefsData = defaultPrefs;
        }

        setNotificationPrefs({
          new_orders: prefsData.new_orders ?? true,
          payment_received: prefsData.payment_received ?? true,
          weekly_reports: prefsData.weekly_reports ?? true,
          product_updates: prefsData.product_updates ?? true,
          browser_notifications: prefsData.browser_notifications ?? false,
          mobile_notifications: prefsData.mobile_notifications ?? false,
        });

        // Fetch pixels from user_pixels table (assuming it exists)
        const { data: pixelsData, error: pixelsError } = await supabase
          .from('user_pixels')
          .select('pixel_id')
          .eq('user_id', user.id);
        if (pixelsError) {
          console.error('Pixels fetch error:', pixelsError);
          throw new Error(`Erro ao buscar pixels: ${pixelsError.message}`);
        }
        setPixels(pixelsData?.map((p: { pixel_id: string }) => p.pixel_id) || []);

        // Check 2FA status
        const { data: mfaData, error: mfaError } = await supabase.auth.mfa.listFactors();
        if (mfaError) {
          console.error('MFA listFactors error:', mfaError);
          throw new Error('Erro ao verificar status de 2FA');
        }
        setIs2FAEnabled(!!mfaData?.totp?.find((factor) => factor.status === 'verified'));
      } catch (error: any) {
        console.error('Erro ao carregar dados:', error);
        toast.error(error.message || 'Falha ao carregar perfil ou preferências');
      }
    };

    fetchProfileAndPrefs();
  }, [user, session, loading, profileForm, deliveryEmailForm, utmifyForm]);

  const onProfileSubmit = async (data: ProfileData) => {
    if (!user || !session) {
      toast.error('Você precisa estar logado para atualizar seu perfil');
      return;
    }

    try {
      const emailChanged = data.email !== user.email;
      const nameChanged = data.name !== (user.user_metadata?.name || '');
      let authUpdated = false;

      if (emailChanged || nameChanged) {
        const updatePayload: any = {};
        if (emailChanged) updatePayload.email = data.email;
        if (nameChanged) updatePayload.user_metadata = { name: data.name.trim() };

        console.log('Update payload:', updatePayload);

        const { data: authData, error: authError } = await supabase.auth.updateUser(updatePayload);

        if (authError) {
          console.error('Auth update error:', authError);
          if (authError.message.includes('email')) {
            throw new Error('Erro ao atualizar email. Verifique se o email já está em uso ou requer confirmação.');
          }
          throw new Error(`Erro ao atualizar dados de autenticação: ${authError.message}`);
        }

        console.log('Auth update response:', authData);
        authUpdated = true;

        await refreshSession();
      }

      const companyChanged = data.company !== (profileForm.getValues('company') || '');
      const websiteChanged = data.website !== (profileForm.getValues('website') || '');
      if (companyChanged || websiteChanged) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert(
            {
              user_id: user.id,
              company: data.company || null,
              website: data.website || null,
            },
            { onConflict: 'user_id' }
          );

        if (profileError) {
          console.error('Profile update error:', profileError);
          throw new Error(`Erro ao atualizar perfil: ${profileError.message}`);
        }
      }

      const { data: { user: refreshedUser } } = await supabase.auth.getUser();
      console.log('Refreshed user after update:', refreshedUser);
      profileForm.setValue('name', refreshedUser?.user_metadata?.name || '');
      profileForm.setValue('email', refreshedUser?.email || '');
      setPendingEmail(refreshedUser?.new_email || null);

      if (emailChanged) {
        toast.success(`Um email de confirmação foi enviado para ${data.email}. Confirme para ativar o novo endereço.`);
      } else if (authUpdated || companyChanged || websiteChanged) {
        toast.success('Perfil atualizado com sucesso!');
      } else {
        toast.success('Nenhuma alteração detectada.');
      }
    } catch (error: any) {
      console.error('Erro ao atualizar perfil:', error);
      toast.error(error.message || 'Falha ao atualizar perfil');
    }
  };

  const resendConfirmationEmail = async () => {
    if (!user || !pendingEmail) {
      toast.error('Nenhum email pendente para reenviar confirmação.');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ email: pendingEmail });
      if (error) {
        console.error('Resend confirmation error:', error);
        throw new Error('Erro ao reenviar email de confirmação.');
      }
      toast.success(`Email de confirmação reenviado para ${pendingEmail}.`);
    } catch (error: any) {
      console.error('Erro ao reenviar confirmação:', error);
      toast.error(error.message || 'Falha ao reenviar email de confirmação');
    }
  };

  const onPasswordSubmit = async (data: PasswordData) => {
    if (!user || !session) {
      toast.error('Você precisa estar logado para atualizar sua senha');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) {
        console.error('Password update error:', error);
        throw new Error(`Erro ao atualizar senha: ${error.message}`);
      }

      toast.success('Senha atualizada com sucesso!');
      passwordForm.reset();
    } catch (error: any) {
      console.error('Erro ao atualizar senha:', error);
      toast.error(error.message || 'Falha ao atualizar senha');
    }
  };

  const onNotificationSubmit = async () => {
    if (!user || !session) {
      toast.error('Você precisa estar logado para atualizar preferências');
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            new_orders: notificationPrefs.new_orders,
            payment_received: notificationPrefs.payment_received,
            weekly_reports: notificationPrefs.weekly_reports,
            product_updates: notificationPrefs.product_updates,
            browser_notifications: notificationPrefs.browser_notifications,
            mobile_notifications: notificationPrefs.mobile_notifications,
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('Preferences update error:', error);
        throw new Error(`Erro ao atualizar preferências: ${error.message}`);
      }

      toast.success('Preferências de notificação atualizadas com sucesso!');
    } catch (error: any) {
      console.error('Erro ao atualizar preferências:', error);
      toast.error(error.message || 'Falha ao atualizar preferências de notificação');
    }
  };

  const handleNotificationChange = (key: keyof NotificationPreferences, value: boolean) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const enable2FA = async () => {
    if (!user || !session) {
      toast.error('Você precisa estar logado para ativar 2FA');
      return;
    }

    try {
      // Ensure session is valid
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSession) {
        console.error('Session error:', sessionError);
        throw new Error('Sessão inválida. Faça login novamente.');
      }

      // Clean up all existing TOTP factors (verified and unverified) to ensure a fresh start
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        console.error('MFA listFactors error:', factorsError);
        throw new Error('Erro ao buscar fatores de 2FA');
      }

      const allFactors = factorsData?.totp || [];
      for (const factor of allFactors) {
        console.log('Removing factor:', factor);
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      // Enroll new TOTP factor
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'CheckoutPro',
        friendlyName: `CheckoutPro:${user.email}-${Date.now()}`, // Unique friendly name with timestamp
      });

      if (error) {
        console.error('2FA enroll error:', error);
        throw new Error('Erro ao iniciar configuração de 2FA');
      }

      const { id: factorId, totp_secret } = data;
      console.log('New TOTP factor:', { factorId, totp_secret });

      setTotpSecret(totp_secret);

      // Construct TOTP URI with proper encoding
      const encodedEmail = encodeURIComponent(user.email);
      const encodedIssuer = encodeURIComponent('CheckoutPro');
      const totpUri = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${totp_secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
      console.log('Generated TOTP URI:', totpUri);
      setQrCodeUri(totpUri);
      setShow2FAModal(true);
    } catch (error: any) {
      console.error('Erro ao configurar 2FA:', error);
      toast.error(error.message || 'Falha ao configurar 2FA');
    }
  };

  const verifyTotpCode = async (data: { totpCode: string }) => {
    if (!user || !session || !totpSecret) {
      toast.error('Sessão inválida para verificar 2FA');
      return;
    }

    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        console.error('MFA listFactors error:', factorsError);
        throw new Error('Erro ao buscar fatores de 2FA');
      }

      const factor = factorsData?.totp?.find((f) => f.status === 'unverified' && f.friendly_name.includes(`CheckoutPro:${user.email}`));
      if (!factor) {
        throw new Error('Nenhum fator TOTP encontrado');
      }

      console.log('Verifying factor:', factor);

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });

      if (challengeError) {
        console.error('MFA challenge error:', challengeError);
        throw new Error('Erro ao criar desafio de 2FA');
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        code: data.totpCode,
      });

      if (verifyError) {
        console.error('MFA verify error:', verifyError);
        throw new Error('Código TOTP inválido');
      }

      setIs2FAEnabled(true);
      setShow2FAModal(false);
      setTotpSecret(null);
      setQrCodeUri(null);
      totpForm.reset();
      toast.success('2FA ativado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao verificar TOTP:', error);
      toast.error(error.message || 'Código TOTP inválido');
    }
  };

  const disable2FA = async () => {
    if (!user || !session) {
      toast.error('Você precisa estar logado para desativar 2FA');
      return;
    }

    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        console.error('MFA listFactors error:', factorsError);
        throw new Error('Erro ao buscar fatores de 2FA');
      }

      const factor = factorsData?.totp?.find((f) => f.status === 'verified' && f.friendly_name.includes(`CheckoutPro:${user.email}`));
      if (!factor) {
        throw new Error('Nenhum fator 2FA ativo encontrado');
      }

      console.log('Disabling factor:', factor);

      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });

      if (unenrollError) {
        console.error('MFA unenroll error:', unenrollError);
        throw new Error('Erro ao desativar 2FA');
      }

      setIs2FAEnabled(false);
      toast.success('2FA desativado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao desativar 2FA:', error);
      toast.error(error.message || 'Falha ao desativar 2FA');
    }
  };

  const addPixel = async () => {
    if (!user || !session || !newPixel.trim()) return;

    try {
      const { error } = await supabase
        .from('user_pixels')
        .insert({ user_id: user.id, pixel_id: newPixel.trim() });

      if (error) {
        console.error('Pixel insert error:', error);
        throw new Error('Erro ao adicionar pixel');
      }

      setPixels([...pixels, newPixel.trim()]);
      setNewPixel('');
      toast.success('Pixel adicionado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao adicionar pixel');
    }
  };

  const removePixel = async (pixelToRemove: string) => {
    if (!user || !session) return;

    try {
      const { error } = await supabase
        .from('user_pixels')
        .delete()
        .eq('user_id', user.id)
        .eq('pixel_id', pixelToRemove);

      if (error) {
        console.error('Pixel delete error:', error);
        throw new Error('Erro ao remover pixel');
      }

      setPixels(pixels.filter((p) => p !== pixelToRemove));
      toast.success('Pixel removido com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao remover pixel');
    }
  };

  const onDeliveryEmailSubmit = async (data: { deliveryEmail: string }) => {
    if (!user || !session) {
      toast.error('Você precisa estar logado para atualizar o email de entrega');
      return;
    }

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ delivery_email: data.deliveryEmail || null })
        .eq('user_id', user.id);

      if (error) {
        console.error('Delivery email update error:', error);
        throw new Error('Erro ao atualizar email de entrega');
      }

      setDeliveryEmail(data.deliveryEmail);
      toast.success('Email de entrega atualizado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao atualizar email de entrega');
    }
  };

  const onUtmifySubmit = async (data: { utmifyKey: string }) => {
    if (!user || !session) {
      toast.error('Você precisa estar logado para atualizar a chave Utmify');
      return;
    }

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ utmify_key: data.utmifyKey || null })
        .eq('user_id', user.id);

      if (error) {
        console.error('Utmify key update error:', error);
        throw new Error('Erro ao atualizar chave Utmify');
      }

      setUtmifyKey(data.utmifyKey);
      toast.success('Integração Utmify atualizada com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao atualizar chave Utmify');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    );
  }

  if (!user || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center py-12">
          <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:!text-white mb-2">
            Por favor, faça login
          </h3>
          <p className="text-sm sm:text-base text-gray-600 dark:!text-gray-400">
            Você precisa estar logado para acessar as configurações.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', name: 'Perfil', icon: UserIcon },
    { id: 'billing', name: 'Cobrança', icon: CreditCardIcon },
    { id: 'notifications', name: 'Notificações', icon: BellIcon },
    { id: 'security', name: 'Segurança', icon: ShieldCheckIcon },
    { id: 'connections', name: 'Conexões', icon: GlobeAltIcon },
  ];

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:!text-white">
            Configurações
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:!text-gray-400 mt-1">
            Gerencie as configurações da sua conta e preferências
          </p>
        </div>

        <div className="flex flex-col lg:flex-row lg:gap-8">
          <div className="lg:w-64">
            <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible space-x-2 lg:space-x-0 lg:space-y-2 mb-4 lg:mb-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    closeSidebar();
                  }}
                  className={`flex items-center space-x-3 px-3 py-2 text-sm sm:text-base font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-indigo-100 dark:bg-gray-800 text-indigo-700 dark:!text-white border border-indigo-200 dark:border-gray-800'
                      : 'text-gray-700 dark:!text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <tab.icon className="h-5 w-5" />
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 mt-4 lg:mt-0">
            {activeTab === 'profile' && (
              <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                  Informações do Perfil
                </h2>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:!text-white mb-2">
                        Nome Completo
                      </label>
                      <input
                        {...profileForm.register('name')}
                        type="text"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="Digite seu nome completo"
                      />
                      {profileForm.formState.errors.name && (
                        <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                          {profileForm.formState.errors.name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:!text-white mb-2">
                        Endereço de Email
                      </label>
                      <input
                        {...profileForm.register('email')}
                        type="email"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="Digite seu email"
                      />
                      {profileForm.formState.errors.email && (
                        <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                          {profileForm.formState.errors.email.message}
                        </p>
                      )}
                      {pendingEmail && pendingEmail !== user.email && (
                        <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:!text-gray-400">
                          <p>
                            Email pendente: {pendingEmail}{' '}
                            <button
                              type="button"
                              onClick={resendConfirmationEmail}
                              className="text-indigo-600 dark:!text-indigo-400 hover:text-indigo-700 dark:hover:!text-indigo-300 font-medium"
                            >
                              Reenviar confirmação
                            </button>
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:!text-white mb-2">
                        Empresa (Opcional)
                      </label>
                      <input
                        {...profileForm.register('company')}
                        type="text"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="Nome da sua empresa"
                      />
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:!text-white mb-2">
                        Website (Opcional)
                      </label>
                      <input
                        {...profileForm.register('website')}
                        type="url"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="https://yourwebsite.com"
                      />
                      {profileForm.formState.errors.website && (
                        <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                          {profileForm.formState.errors.website.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="bg-indigo-600 dark:bg-black text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                      disabled={profileForm.formState.isSubmitting}
                    >
                      {profileForm.formState.isSubmitting ? 'Aguarde...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                    Plano Atual
                  </h2>
                  <div className="plan-card border border-indigo-200 dark:border-gray-800 rounded-lg p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-indigo-700 dark:!text-white">
                          Plano Gratuito
                        </h3>
                        <p className="text-indigo-600 dark:!text-gray-300 mt-1 text-sm sm:text-base">
                          Perfeito para começar
                        </p>
                        <ul className="mt-3 sm:mt-4 space-y-1 sm:space-y-2 text-xs sm:text-sm text-indigo-800 dark:!text-gray-200">
                          <li>• Até 3 páginas de checkout</li>
                          <li>• Personalização básica</li>
                          <li>• Taxa de transação de 5%</li>
                          <li>• Suporte por email</li>
                        </ul>
                      </div>
                      <div className="text-right">
                        <span className="text-xl sm:text-2xl font-bold text-indigo-700 dark:!text-white">
                          R$0
                        </span>
                        <p className="text-indigo-600 dark:!text-gray-300 text-sm sm:text-base">/mês</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 sm:mt-6">
                    <h3 className="text-sm sm:text-md font-semibold text-gray-900 dark:!text-white mb-3 sm:mb-4">
                      Opções de Upgrade
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 sm:p-4">
                        <h4 className="font-semibold text-gray-900 dark:!text-white text-sm sm:text-base">
                          Plano Pro
                        </h4>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:!text-white mt-2">
                          R$29<span className="text-xs sm:text-sm font-normal">/mês</span>
                        </p>
                        <ul className="mt-3 sm:mt-4 space-y-1 text-xs sm:text-sm text-gray-600 dark:!text-gray-400">
                          <li>• Páginas de checkout ilimitadas</li>
                          <li>• Personalização avançada</li>
                          <li>• Taxa de transação de 3%</li>
                          <li>• Suporte prioritário</li>
                        </ul>
                        <button className="w-full mt-3 sm:mt-4 bg-indigo-600 dark:bg-black text-white py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-colors text-sm sm:text-base">
                          Upgrade para Pro
                        </button>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 sm:p-4">
                        <h4 className="font-semibold text-gray-900 dark:!text-white text-sm sm:text-base">
                          Empresarial
                        </h4>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:!text-white mt-2">
                          R$99<span className="text-xs sm:text-sm font-normal">/mês</span>
                        </p>
                        <ul className="mt-3 sm:mt-4 space-y-1 text-xs sm:text-sm text-gray-600 dark:!text-gray-400">
                          <li>• Tudo do Pro</li>
                          <li>• Solução white-label</li>
                          <li>• Taxa de transação de 1%</li>
                          <li>• Suporte dedicado</li>
                        </ul>
                        <button className="w-full mt-3 sm:mt-4 bg-gray-600 dark:bg-black text-white py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600 dark:focus:ring-gray-500 transition-colors text-sm sm:text-base">
                          Contatar Vendas
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                    Histórico de Cobrança
                  </h2>
                  <div className="text-center py-6 sm:py-8 text-gray-500 dark:!text-gray-400">
                    <CreditCardIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-gray-400 dark:!text-gray-500" />
                    <p className="text-sm sm:text-base">Nenhum histórico de cobrança ainda</p>
                    <p className="text-xs sm:text-sm">Suas faturas aparecerão aqui quando você fizer upgrade</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                  Preferências de Notificação
                </h2>
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <h3 className="text-sm sm:text-md font-semibold text-gray-900 dark:!text-white mb-3 sm:mb-4">
                      Notificações por Email
                    </h3>
                    <div className="space-y-3 sm:space-y-4">
                      {[
                        {
                          id: 'new_orders',
                          label: 'Novos Pedidos',
                          description: 'Seja notificado quando receber um novo pedido',
                        },
                        {
                          id: 'payment_received',
                          label: 'Pagamento Recebido',
                          description: 'Seja notificado quando pagamentos forem processados',
                        },
                        {
                          id: 'weekly_reports',
                          label: 'Relatórios Semanais',
                          description: 'Receba relatórios semanais de vendas e análises',
                        },
                        {
                          id: 'product_updates',
                          label: 'Atualizações do Produto',
                          description: 'Mantenha-se atualizado com novos recursos e melhorias',
                        },
                      ].map((notification) => (
                        <div key={notification.id} className="flex items-center justify-between py-2 sm:py-3">
                          <div>
                            <h4 className="font-medium text-gray-900 dark:!text-white text-sm sm:text-base">
                              {notification.label}
                            </h4>
                            <p className="text-xs sm:text-sm text-gray-600 dark:!text-gray-400">
                              {notification.description}
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notificationPrefs[notification.id as keyof NotificationPreferences]}
                              onChange={(e) =>
                                handleNotificationChange(notification.id as keyof NotificationPreferences, e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-10 h-5 sm:w-11 sm:h-6 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 dark:after:border-gray-800 after:border after:rounded-full after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:transition-all peer-checked:bg-indigo-600 dark:peer-checked:bg-indigo-500"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-black pt-4 sm:pt-6">
                    <h3 className="text-sm sm:text-md font-semibold text-gray-900 dark:!text-white mb-3 sm:mb-4">
                      Notificações Push
                    </h3>
                    <div className="space-y-3 sm:space-y-4">
                      {[
                        {
                          id: 'browser_notifications',
                          label: 'Notificações do Navegador',
                          description: 'Receba notificações no seu navegador',
                        },
                        {
                          id: 'mobile_notifications',
                          label: 'Notificações Mobile',
                          description: 'Receba notificações push em dispositivos móveis',
                        },
                      ].map((notification) => (
                        <div key={notification.id} className="flex items-center justify-between py-2 sm:py-3">
                          <div>
                            <h4 className="font-medium text-gray-900 dark:!text-white text-sm sm:text-base">
                              {notification.label}
                            </h4>
                            <p className="text-xs sm:text-sm text-gray-600 dark:!text-gray-400">
                              {notification.description}
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notificationPrefs[notification.id as keyof NotificationPreferences]}
                              onChange={(e) =>
                                handleNotificationChange(notification.id as keyof NotificationPreferences, e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-10 h-5 sm:w-11 sm:h-6 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 dark:after:border-gray-800 after:border after:rounded-full after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:transition-all peer-checked:bg-indigo-600 dark:peer-checked:bg-indigo-500"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 dark:border-black">
                    <button
                      onClick={onNotificationSubmit}
                      className="bg-indigo-600 dark:bg-black text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-colors text-sm sm:text-base"
                    >
                      Salvar Preferências
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                    Alterar Senha
                  </h2>
                  <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 sm:space-y-6">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:!text-white mb-2">
                        Senha Atual
                      </label>
                      <input
                        {...passwordForm.register('currentPassword')}
                        type="password"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="Digite sua senha atual"
                      />
                      {passwordForm.formState.errors.currentPassword && (
                        <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                          {passwordForm.formState.errors.currentPassword.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:!text-white mb-2">
                        Nova Senha
                      </label>
                      <input
                        {...passwordForm.register('newPassword')}
                        type="password"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="Digite sua nova senha"
                      />
                      {passwordForm.formState.errors.newPassword && (
                        <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                          {passwordForm.formState.errors.newPassword.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-900 dark:!text-white mb-2">
                        Confirmar Nova Senha
                      </label>
                      <input
                        {...passwordForm.register('confirmPassword')}
                        type="password"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="Confirme sua nova senha"
                      />
                      {passwordForm.formState.errors.confirmPassword && (
                        <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                          {passwordForm.formState.errors.confirmPassword.message}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="bg-indigo-600 dark:bg-black text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                        disabled={passwordForm.formState.isSubmitting}
                      >
                        {passwordForm.formState.isSubmitting ? 'Aguarde...' : 'Atualizar Senha'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                    Autenticação de Dois Fatores
                  </h2>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-gray-50 dark:bg-black rounded-lg gap-4">
                    <div className="flex items-center space-x-3">
                      <ShieldCheckIcon className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400 dark:!text-gray-500" />
                      <div>
                        <h3 className="font-medium text-gray-900 dark:!text-white text-sm sm:text-base">
                          Autenticação de Dois Fatores
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 dark:!text-gray-400">
                          {is2FAEnabled
                            ? '2FA está ativado para sua conta'
                            : 'Adicione uma camada extra de segurança à sua conta'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={is2FAEnabled ? disable2FA : enable2FA}
                      className={`bg-${
                        is2FAEnabled ? 'red' : 'indigo'
                      }-600 dark:bg-${
                        is2FAEnabled ? 'red' : 'black'
                      } text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-${
                        is2FAEnabled ? 'red' : 'indigo'
                      }-700 dark:hover:bg-${
                        is2FAEnabled ? 'red' : 'gray-900'
                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${
                        is2FAEnabled ? 'red' : 'indigo'
                      }-600 dark:focus:ring-${
                        is2FAEnabled ? 'red' : 'indigo'
                      }-500 transition-colors text-sm sm:text-base`}
                    >
                      {is2FAEnabled ? 'Desativar 2FA' : 'Ativar 2FA'}
                    </button>
                  </div>
                </div>

                {show2FAModal && (
                  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-black rounded-xl p-6 w-full max-w-md">
                      <h3 className="text-lg font-semibold text-gray-900 dark:!text-white mb-4">
                        Configurar Autenticação de Dois Fatores
                      </h3>
                      <p className="text-sm text-gray-600 dark:!text-gray-400 mb-4">
                        Escaneie o QR code com seu aplicativo autenticador ou insira o código manualmente.
                      </p>
                      {qrCodeUri && (
                        <div className="flex justify-center mb-4">
                          <QRCodeCanvas value={qrCodeUri} size={200} />
                        </div>
                      )}
                      {totpSecret && (
                        <div className="mb-4">
                          <p className="text-sm text-gray-600 dark:!text-gray-400">
                            Código manual: <code className="break-all">{totpSecret}</code>
                          </p>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(totpSecret)}
                            className="mt-2 text-indigo-600 dark:!text-indigo-400 hover:text-indigo-700 dark:hover:!text-indigo-300 text-sm"
                          >
                            Copiar código
                          </button>
                        </div>
                      )}
                      <form
                        onSubmit={totpForm.handleSubmit(verifyTotpCode)}
                        className="space-y-4"
                      >
                        <div>
                          <label className="block text-sm font-medium text-gray-900 dark:!text-white mb-2">
                            Código TOTP
                          </label>
                          <input
                            {...totpForm.register('totpCode')}
                            type="text"
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                            placeholder="Digite o código de 6 dígitos"
                          />
                          {totpForm.formState.errors.totpCode && (
                            <p className="mt-1 text-sm text-red-600 dark:!text-red-400">
                              {totpForm.formState.errors.totpCode.message}
                            </p>
                          )}
                        </div>
                        <div className="flex justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShow2FAModal(false);
                              setTotpSecret(null);
                              setQrCodeUri(null);
                              totpForm.reset();
                            }}
                            className="bg-gray-300 dark:bg-gray-800 text-gray-900 dark:!text-white px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors text-sm"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={totpForm.formState.isSubmitting}
                            className="bg-indigo-600 dark:bg-black text-white px-4 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                          >
                            {totpForm.formState.isSubmitting ? 'Aguarde...' : 'Verificar Código'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                    Chaves da API
                  </h2>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 border border-gray-200 dark:border-gray-800 rounded-lg gap-4">
                      <div className="flex items-center space-x-3">
                        <KeyIcon className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 dark:!text-gray-500" />
                        <div>
                          <h3 className="font-medium text-gray-900 dark:!text-white text-sm sm:text-base">
                            Chave da API Webhook
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-600 dark:!text-gray-400">
                            Use esta chave para receber notificações webhook
                          </p>
                        </div>
                      </div>
                      <button className="text-indigo-600 dark:!text-indigo-400 hover:text-indigo-700 dark:hover:!text-indigo-300 font-medium text-sm sm:text-base">
                        Gerar Chave
                      </button>
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 sm:p-4">
                      <p className="text-yellow-800 dark:!text-yellow-200 text-xs sm:text-sm">
                        ⚠️ As chaves da API fornecem acesso à sua conta. Mantenha-as seguras e nunca as
                        compartilhe publicamente.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'connections' && (
              <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-black">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white mb-4 sm:mb-6">
                  Conexões
                </h2>
                <div className="space-y-8">
                  {/* Pixels Section */}
                  <div>
                    <h3 className="text-sm sm:text-md font-semibold text-gray-900 dark:!text-white mb-3 sm:mb-4">
                      Pixels do Facebook
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:!text-gray-400 mb-4">
                      Adicione pixels para suas campanhas. Você pode adicionar quantos quiser.
                    </p>
                    <div className="space-y-2 mb-4">
                      {pixels.length > 0 ? (
                        pixels.map((pixel, index) => (
                          <div key={index} className="flex items-center justify-between p-2 border border-gray-200 dark:border-gray-800 rounded-lg">
                            <span className="text-sm text-gray-900 dark:!text-white">{pixel}</span>
                            <button
                              onClick={() => removePixel(pixel)}
                              className="text-red-600 dark:!text-red-400 hover:text-red-700 dark:hover:!text-red-300 text-sm"
                            >
                              Remover
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-600 dark:!text-gray-400">Nenhum pixel adicionado ainda.</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={newPixel}
                        onChange={(e) => setNewPixel(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                        placeholder="Digite o ID do pixel"
                      />
                      <button
                        onClick={addPixel}
                        className="bg-indigo-600 dark:bg-black text-white px-4 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 transition-colors text-sm"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>

                  {/* Provedor de Email Section */}
                  <div className="border-t border-gray-200 dark:border-black pt-4 sm:pt-6">
                    <h3 className="text-sm sm:text-md font-semibold text-gray-900 dark:!text-white mb-3 sm:mb-4">
                      Provedor de Email
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:!text-gray-400 mb-4">
                      Adicione um email personalizado para entrega de produtos.
                    </p>
                    <form onSubmit={deliveryEmailForm.handleSubmit(onDeliveryEmailSubmit)} className="space-y-4">
                      <div>
                        <input
                          {...deliveryEmailForm.register('deliveryEmail')}
                          type="email"
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                          placeholder="Digite o email de entrega"
                        />
                        {deliveryEmailForm.formState.errors.deliveryEmail && (
                          <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                            {deliveryEmailForm.formState.errors.deliveryEmail.message}
                          </p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="bg-indigo-600 dark:bg-black text-white px-4 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 transition-colors text-sm"
                          disabled={deliveryEmailForm.formState.isSubmitting}
                        >
                          {deliveryEmailForm.formState.isSubmitting ? 'Aguarde...' : 'Salvar Email'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Utmify Section */}
                  <div className="border-t border-gray-200 dark:border-black pt-4 sm:pt-6">
                    <h3 className="text-sm sm:text-md font-semibold text-gray-900 dark:!text-white mb-3 sm:mb-4">
                      Integração Utmify
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:!text-gray-400 mb-4">
                      Integre com a plataforma Utmify fornecendo sua chave de API.
                    </p>
                    <form onSubmit={utmifyForm.handleSubmit(onUtmifySubmit)} className="space-y-4">
                      <div>
                        <input
                          {...utmifyForm.register('utmifyKey')}
                          type="text"
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 bg-white dark:bg-black text-gray-900 dark:!text-white"
                          placeholder="Digite a chave de API Utmify"
                        />
                        {utmifyForm.formState.errors.utmifyKey && (
                          <p className="mt-1 text-xs sm:text-sm text-red-600 dark:!text-red-400">
                            {utmifyForm.formState.errors.utmifyKey.message}
                          </p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="bg-indigo-600 dark:bg-black text-white px-4 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-gray-900 transition-colors text-sm"
                          disabled={utmifyForm.formState.isSubmitting}
                        >
                          {utmifyForm.formState.isSubmitting ? 'Aguarde...' : 'Salvar Integração'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}