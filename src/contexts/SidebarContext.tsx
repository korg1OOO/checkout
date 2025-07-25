// src/contexts/SidebarContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';

interface SidebarContextType {
  toggleSidebar: () => void;
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarProvider = ({
  children,
  toggleSidebar,
  closeSidebar,
}: {
  children: ReactNode;
  toggleSidebar: () => void;
  closeSidebar: () => void;
}) => {
  return (
    <SidebarContext.Provider value={{ toggleSidebar, closeSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};