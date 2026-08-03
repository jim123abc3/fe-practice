import "../styles/globals.css";
import type { AppProps } from "next/app";
import { CacheProvider, EmotionCache } from "@emotion/react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import createEmotionCache from "@/lib/emotion";
import { theme } from "@/theme";

import { useState } from "react";
import { makeQueryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";

export interface MyAppProps extends AppProps {
  emotionCache?: EmotionCache;
}

const clientSideCache = createEmotionCache();

export default function App({
  Component,
  pageProps,
  emotionCache = clientSideCache,
}: MyAppProps) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <Component {...pageProps} />
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}
