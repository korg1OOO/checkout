import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string, totpCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Session refresh error:', error);
        throw new Error('Erro ao atualizar sessão');
      }
      setSession(session);
      setUser(session?.user ?? null);
      return session;
    } catch (error: any) {
      console.error('Session refresh failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('Auth state changed:', event, newSession);
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (event === 'USER_UPDATED') {
        refreshSession().catch((error) => {
          console.error('Error refreshing session after USER_UPDATED:', error);
          toast.error('Erro ao atualizar dados do usuário');
        });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });
      if (error) {
        console.error('Sign-up error:', error);
        throw new Error(error.message);
      }
      toast.success('Conta criada com sucesso! Verifique seu email para confirmar.');
    } catch (error: any) {
      console.error('Sign-up failed:', error);
      toast.error(error.message || 'Erro ao criar conta');
      throw error;
    }
  };

  const signIn = async (email: string, password: string, totpCode?: string) => {
    try {
      // Initial sign-in with email and password
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('Sign-in error:', authError);
        throw new Error(authError.message);
      }

      // Check if 2FA is enabled
      const { data: mfaData, error: mfaError } = await supabase.auth.mfa.listFactors();
      if (mfaError) {
        console.error('MFA listFactors error:', mfaError);
        throw new Error('Erro ao verificar status de 2FA');
      }

      const totpFactor = mfaData?.totp?.find((f) => f.status === 'verified');
      if (totpFactor && !totpCode) {
        throw new Error('Código TOTP é necessário para autenticação');
      }

      if (totpFactor && totpCode) {
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: totpFactor.id,
        });

        if (challengeError) {
          console.error('MFA challenge error:', challengeError);
          throw new Error('Erro ao criar desafio de 2FA');
        }

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: totpFactor.id,
          code: totpCode,
        });

        if (verifyError) {
          console.error('MFA verify error:', verifyError);
          throw new Error('Código TOTP inválido');
        }
      }

      await refreshSession();
      toast.success('Login realizado com sucesso!');
    } catch (error: any) {
      console.error('Sign-in failed:', error);
      toast.error(error.message || 'Erro ao fazer login');
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign-out error:', error);
        throw new Error(error.message);
      }
      setSession(null);
      setUser(null);
      toast.success('Logout realizado com sucesso!');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error(error.message || 'Erro ao fazer logout');
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}