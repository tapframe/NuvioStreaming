import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';

type ScrollToTopListener = () => void;

interface ScrollToTopContextType {
    emitScrollToTop: (routeName: string) => void;
    subscribe: (routeName: string, listener: ScrollToTopListener) => () => void;
}

const ScrollToTopContext = createContext<ScrollToTopContextType | null>(null);

export const ScrollToTopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const listenersRef = useRef<Map<string, Set<ScrollToTopListener>>>(new Map());

    const subscribe = useCallback((routeName: string, listener: ScrollToTopListener) => {
        if (!listenersRef.current.has(routeName)) {
            listenersRef.current.set(routeName, new Set());
        }
        listenersRef.current.get(routeName)!.add(listener);

        // Return unsubscribe function
        return () => {
            listenersRef.current.get(routeName)?.delete(listener);
        };
    }, []);

    const emitScrollToTop = useCallback((routeName: string) => {
        const listeners = listenersRef.current.get(routeName);
        if (listeners) {
            listeners.forEach(listener => listener());
        }
    }, []);

    return (
        <ScrollToTopContext.Provider value={{ emitScrollToTop, subscribe }}>
            {children}
        </ScrollToTopContext.Provider>
    );
};

export const useScrollToTop = (routeName: string, scrollToTop: () => void) => {
    const context = useContext(ScrollToTopContext);

    useEffect(() => {
        if (!context) return;

        const unsubscribe = context.subscribe(routeName, scrollToTop);
        return unsubscribe;
    }, [context, routeName, scrollToTop]);
};

export const useScrollToTopEmitter = () => {
    const context = useContext(ScrollToTopContext);
    return context?.emitScrollToTop || (() => { });
};

export default ScrollToTopContext;
