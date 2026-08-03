import { createContext, useContext, useState, type ReactNode } from "react";

interface FiltersContextValue {
  q: string;
  setQ: (q: string) => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersContextProvider({ children }: { children: ReactNode }) {
  const [q, setQ] = useState("");

  return (
    <FiltersContext.Provider value={{ q, setQ }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error("useFilters must be used within a FiltersContextProvider");
  }
  return context;
}
