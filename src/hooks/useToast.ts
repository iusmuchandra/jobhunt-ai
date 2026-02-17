import { useState, useCallback } from 'react';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let currentToasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach(l => l([...currentToasts]));
}

export function toast(options: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  currentToasts = [...currentToasts, { ...options, id }];
  notifyListeners();
  setTimeout(() => {
    currentToasts = currentToasts.filter(t => t.id !== id);
    notifyListeners();
  }, 4000);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(currentToasts);

  const subscribe = useCallback(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter(l => l !== setToasts);
    };
  }, []);

  return { toasts, toast, subscribe };
}