"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type RentCollectionAccountSelectionContextValue = {
  selectedAccountId: string | null;
  setSelectedAccountId: (accountId: string | null) => void;
  resetSelectedAccountId: () => void;
};

const RentCollectionAccountSelectionContext =
  createContext<RentCollectionAccountSelectionContextValue | null>(null);

export function RentCollectionAccountSelectionProvider({
  initialAccountId,
  children,
}: {
  initialAccountId: string | null;
  children: ReactNode;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId);

  useEffect(() => {
    setSelectedAccountId(initialAccountId);
  }, [initialAccountId]);

  const value = useMemo(
    () => ({
      selectedAccountId,
      setSelectedAccountId,
      resetSelectedAccountId: () => setSelectedAccountId(initialAccountId),
    }),
    [initialAccountId, selectedAccountId],
  );

  return (
    <RentCollectionAccountSelectionContext.Provider value={value}>
      {children}
    </RentCollectionAccountSelectionContext.Provider>
  );
}

export function useRentCollectionAccountSelection() {
  return useContext(RentCollectionAccountSelectionContext);
}
