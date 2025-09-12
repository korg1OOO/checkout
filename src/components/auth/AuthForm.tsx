import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '../../contexts/AuthContext';
import { CreditCardIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const signInSchema = yup.object({
  email: yup.string().email('Email inválido').required('Email é obrigatório'),
  password: yup.string().min(6, 'A senha deve ter pelo menos 6 caracteres').required('Senha é obrigatória'),
  totpCode: yup.string().matches(/^\d{6}$/, 'O código TOTP deve ser um número de 6 dígitos').optional(),
});

const signUpSchema = yup.object({
  name: yup.string().required('Nome é obrigatório'),
  email: yup.string().email('Email inválido').required('Email é obrigatório'),
  password: yup.string().min(6, 'A senha deve ter pelo menos 6 caracteres').required('Senha é obrigatória'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'As senhas devem coincidir')
    .required('Confirmação de senha é obrigatória'),
});

interface SignInData {
  email: string;
  password: string;
  totpCode?: string;
}

interface SignUpData extends SignInData {
  name: string;
  confirmPassword: string;
}

export default function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const { signIn, signUp } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: yupResolver(isSignUp ? signUpSchema : signInSchema),
  });

  const onSubmit = async (data: SignInData | SignUpData) => {
    try {
      if (isSignUp) {
        const signUpData = data as SignUpData;
        await signUp(signUpData.email, signUpData.password, signUpData.name);
        reset();
      } else {
        try {
          await signIn(data.email, data.password, data.totpCode);
          reset();
        } catch (error: any) {
          if (error.message === 'Código TOTP é necessário para autenticação') {
            setRequires2FA(true);
          } else {
            throw error;
          }
        }
      }
    } catch (error: any) {
      // Error handling is done in the auth context, but we can customize the toast here if needed
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setRequires2FA(false);
    reset();
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(to_bottom_right,#000_0%,#000_50%,#fff_100%)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <CreditCardIcon className="h-12 w-12 text-gray-400" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-300">CheckoutPro</h2>
          <p className="mt-2 text-sm text-gray-400">
            {isSignUp ? 'Crie sua conta' : 'Entre na sua conta'}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300">
                  Nome Completo
                </label>
                <input
                  {...register('name')}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-600 bg-gray-800 text-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Digite seu nome completo"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                Endereço de Email
              </label>
              <input
                {...register('email')}
                type="email"
                className="mt-1 block w-full px-3 py-2 border border-gray-600 bg-gray-800 text-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Digite seu email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Senha
              </label>
              <input
                {...register('password')}
                type="password"
                className="mt-1 block w-full px-3 py-2 border border-gray-600 bg-gray-800 text-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>

            {isSignUp && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
                  Confirmar Senha
                </label>
                <input
                  {...register('confirmPassword')}
                  type="password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-600 bg-gray-800 text-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Confirme sua senha"
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>
            )}

            {requires2FA && (
              <div>
                <label htmlFor="totpCode" className="block text-sm font-medium text-gray-300">
                  Código TOTP
                </label>
                <input
                  {...register('totpCode')}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-600 bg-gray-800 text-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Digite o código de 6 dígitos"
                />
                {errors.totpCode && (
                  <p className="mt-1 text-sm text-red-500">{errors.totpCode.message}</p>
                )}
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Aguarde...' : (isSignUp ? 'Criar Conta' : 'Entrar')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-gray-400 hover:text-gray-300"
            >
              {isSignUp
                ? 'Já tem uma conta? Entre'
                : 'Não tem uma conta? Cadastre-se'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}