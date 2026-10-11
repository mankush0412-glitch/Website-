import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, FileText, GraduationCap, IndianRupee, LoaderCircle, LockKeyhole, Minus, Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

type Product = {
  id: string;
  title: string;
  subject: string;
  type: string;
  price: number;
  description: string;
  image?: string;
};
type CartLine = { productId: string; qty: number };
type StoreUser = { id: string; name: string; email: string; provider: string };
type OrderItem = { productId: string; title?: string; qty?: number; price?: number };
type StoreOrder = { id: string; items: OrderItem[]; total: number; utr: string; status: string; createdAt: string };
type Quote = { quoteId: string; expiresAt: string; total: number; upiId: string; upiUri: string; qrDataUrl: string };
type GoogleResponse = { credential?: string };
type TeamSecretConfig = { API_BASE_URL?: string; GOOGLE_CLIENT_ID?: string };

declare global {
  interface Window {
    TEAM_SECRET_CONFIG?: TeamSecretConfig;
    google?: {
      accounts?: {
        id?: {
          initialize: (options: { client_id: string; callback: (response: GoogleResponse) => void }) => void;
          renderButton: (element: HTMLElement, options: { theme?: string; size?: string; shape?: string; width?: number; text?: string }) => void;
        };
      };
    };
  }
}

const queryClient = new QueryClient();
const CONFIG = window.TEAM_SECRET_CONFIG || {};
const API_BASE = String(CONFIG.API_BASE_URL || '').replace(/\/$/, '');
const GOOGLE_CLIENT_ID = String(CONFIG.GOOGLE_CLIENT_ID || '');
const IS_DEV = import.meta.env.DEV;
const TOKEN_KEY = 'ts-user-token';
const SAMPLE_PRODUCTS: Product[] = [
  { id: 'p1', title: 'Class 12 Physics — Full Notes', subject: 'Physics', type: 'handwritten', price: 149, description: 'Chapter-wise handwritten notes covering the full CBSE Class 12 Physics syllabus, with diagrams and the derivations students tend to revisit.' },
  { id: 'p2', title: 'Organic Chemistry Crash Guide', subject: 'Chemistry', type: 'guide', price: 199, description: 'A compact revision guide to reaction mechanisms, named reactions and the patterns that make organic chemistry click.' },
  { id: 'p3', title: 'Data Structures E-book', subject: 'Computer Science', type: 'ebook', price: 249, description: 'A clear, beginner-friendly tour of arrays, trees, graphs and the problem-solving ideas behind common interview questions.' },
  { id: 'p4', title: 'UPSC Essay Answer Templates', subject: 'UPSC', type: 'template', price: 99, description: 'Thoughtful, adaptable essay frameworks to help you plan a balanced argument and write with confidence under time pressure.' },
];
const TYPE_LABELS: Record<string, string> = {
  handwritten: 'Handwritten notes',
  ebook: 'E-book',
  guide: 'Revision guide',
  template: 'Study resource',
};
const CATEGORIES = [
  { id: 'all', label: 'Everything' },
  { id: 'handwritten', label: 'Handwritten notes' },
  { id: 'ebook', label: 'E-books' },
  { id: 'guide', label: 'Revision guides' },
  { id: 'template', label: 'Study templates' },
];
const money = (amount: number) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;
const safeExternal = (value: string) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

async function apiRequest<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  if (!API_BASE) throw new Error('The Render backend is not configured for this storefront yet.');
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status}).`);
  return data as T;
}

function classify(type: string) {
  return TYPE_LABELS[type] || type.replace(/[_-]/g, ' ');
}

function ProductCover({ product, index, large = false }: { product: Product; index: number; large?: boolean }) {
  const palette = `palette-${(index % 4) + 1}`;
  return (
    <div className={`cover-art ${palette}${large ? ' detail-cover' : ''}`} data-testid={`img-product-cover-${product.id}`}>
      {product.image ? (
        <img src={product.image} alt={`${product.title} cover`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      ) : (
        <div className="cover-sheet" aria-hidden="true">
          <div className="sheet-kicker">Next Level notes</div>
          <div className="sheet-title">{product.subject}<br />study set</div>
          <div className="sheet-rule" /><div className="sheet-rule" /><div className="sheet-rule short" />
        </div>
      )}
      {!large && <span className="cover-label">{classify(product.type)}</span>}
    </div>
  );
}

function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState('');
  const [settings, setSettings] = useState<{ upiId: string; supportContact: string; supportUrl: string }>({ upiId: '', supportContact: '', supportUrl: '' });
  const [cart, setCart] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('nln-cart') || '[]') as CartLine[]; } catch { return []; }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState<StoreUser | null>(null);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('featured');
  const [modal, setModal] = useState<'login' | 'account' | 'orders' | 'checkout' | 'product' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [utr, setUtr] = useState('');
  const [orderSending, setOrderSending] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState('');

  useEffect(() => {
    localStorage.setItem('nln-cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (IS_DEV) {
      setProducts(SAMPLE_PRODUCTS);
      setLoadingProducts(false);
      return;
    }
    let alive = true;
    setLoadingProducts(true);
    apiRequest<{ products: Product[] }>('/api/products')
      .then((result) => { if (alive) setProducts(Array.isArray(result.products) ? result.products : []); })
      .catch((error: Error) => { if (alive) setProductError(error.message || 'We could not load the study shelf.'); })
      .finally(() => { if (alive) setLoadingProducts(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (IS_DEV || !API_BASE) return;
    let alive = true;
    apiRequest<{ upiId?: string; supportContact?: string; supportUrl?: string }>('/api/settings/public')
      .then((data) => { if (alive) setSettings({ upiId: data.upiId || '', supportContact: data.supportContact || '', supportUrl: data.supportUrl || '' }); })
      .catch(() => { /* Public catalogue remains usable when optional settings are unavailable. */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const cartTotal = cart.reduce((sum, line) => sum + (products.find((product) => product.id === line.productId)?.price || 0) * line.qty, 0);
  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = products.filter((product) =>
      (category === 'all' || product.type.toLowerCase() === category) &&
      (!needle || `${product.title} ${product.subject} ${product.type} ${product.description}`.toLowerCase().includes(needle)),
    );
    if (sort === 'price-low') return filtered.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') return filtered.sort((a, b) => b.price - a.price);
    return filtered;
  }, [category, products, query, sort]);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const result = await apiRequest<{ orders: StoreOrder[] }>('/api/orders/me', { token });
      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : 'Your orders could not be loaded.');
    } finally {
      setOrdersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (modal === 'orders') void fetchOrders();
  }, [fetchOrders, modal]);

  useEffect(() => {
    if (modal !== 'login' || IS_DEV || !GOOGLE_CLIENT_ID) return;
    let attempts = 0;
    const mountGoogleButton = () => {
      const holder = document.getElementById('google-signin-button');
      if (holder && window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => { if (response.credential) void completeGoogleSignIn(response.credential); },
        });
        holder.innerHTML = '';
        window.google.accounts.id.renderButton(holder, { theme: 'outline', size: 'large', shape: 'rectangular', width: Math.min(holder.clientWidth || 280, 360), text: 'continue_with' });
        return;
      }
      attempts += 1;
      if (attempts < 12) window.setTimeout(mountGoogleButton, 400);
    };
    mountGoogleButton();
    // Sign-in is initialized only while its dialog is visible; the server verifies every credential.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  async function completeGoogleSignIn(credential: string) {
    try {
      const result = await apiRequest<{ user: StoreUser; userToken: string }>('/api/auth/google', { method: 'POST', body: { credential } });
      setUser(result.user);
      setToken(result.userToken);
      localStorage.setItem(TOKEN_KEY, result.userToken);
      setModal('account');
      setToast('You are signed in. Your study shelf is ready.');
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Google sign-in could not be completed.');
    }
  }

  function addToCart(product: Product, openDrawer = false) {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      return existing
        ? current.map((line) => line.productId === product.id ? { ...line, qty: line.qty + 1 } : line)
        : [...current, { productId: product.id, qty: 1 }];
    });
    setToast(`${product.title} added to your bag.`);
    if (openDrawer) { setSelectedProduct(null); setModal(null); setCartOpen(true); }
  }

  function changeQuantity(productId: string, amount: number) {
    setCart((current) => current.map((line) => line.productId === productId ? { ...line, qty: line.qty + amount } : line).filter((line) => line.qty > 0));
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((line) => line.productId !== productId));
    setToast('Removed from your bag.');
  }

  async function beginCheckout() {
    setCartOpen(false);
    setCheckoutError('');
    setUtr('');
    setQuote(null);
    setModal('checkout');
    if (IS_DEV) return;
    if (!API_BASE) { setCheckoutError('Checkout activates once the Render backend is configured for this storefront.'); return; }
    if (!token) { setModal('login'); setCheckoutError('Sign in with Google before creating a secure UPI checkout.'); return; }
    setQuoteLoading(true);
    try {
      const result = await apiRequest<Quote>('/api/checkout/quote', {
        method: 'POST', token,
        body: { items: cart.map((line) => ({ productId: line.productId, qty: line.qty })) },
      });
      setQuote(result);
      setModal('checkout');
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'We could not prepare your payment.');
    } finally {
      setQuoteLoading(false);
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (IS_DEV || !quote || !token) return;
    if (utr.trim().length < 6) { setCheckoutError('Enter the UPI transaction reference from your payment app.'); return; }
    setCheckoutError('');
    setOrderSending(true);
    try {
      const result = await apiRequest<{ order: StoreOrder }>('/api/orders', { method: 'POST', token, body: { quoteId: quote.quoteId, utr: utr.trim() } });
      setOrders((current) => [result.order, ...current]);
      setCart([]);
      setQuote(null);
      setModal('orders');
      setToast('Order submitted. We will update its approval status here.');
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'The order could not be submitted.');
    } finally {
      setOrderSending(false);
    }
  }

  async function downloadItem(order: StoreOrder, item: OrderItem) {
    if (!token) { setModal('login'); return; }
    const key = `${order.id}:${item.productId}`;
    setDownloadBusy(key);
    try {
      const response = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(order.id)}/download/${encodeURIComponent(item.productId)}`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'This download is not available yet.');
      }
      if (contentType.includes('application/json')) {
        const result = await response.json() as { legacyExternal?: boolean; externalUrl?: string };
        const href = result.legacyExternal ? safeExternal(result.externalUrl || '') : '';
        if (!href) throw new Error('This file is not available right now.');
        window.open(href, '_blank', 'noopener,noreferrer');
      } else {
        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const encodedName = response.headers.get('X-Download-Filename');
        link.href = href;
        link.download = encodedName ? decodeURIComponent(encodedName) : `${item.title || 'study-resource'}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Download unavailable.');
    } finally {
      setDownloadBusy('');
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('nln-cart');
    setToken('');
    setUser(null);
    setOrders([]);
    setCart([]);
    setModal(null);
    setToast('You have been signed out. Your bag has been cleared.');
  }

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setModal('product');
  }

  function startShopping() {
    document.getElementById('study-shelf')?.scrollIntoView({ behavior: 'smooth' });
  }

  const supportHref = settings.supportUrl ? safeExternal(settings.supportUrl) : settings.supportContact.includes('@')
    ? `mailto:${settings.supportContact}` : safeExternal(settings.supportContact);
  const supportLabel = settings.supportContact || 'Student support';

  return (
    <div className="storefront" data-testid="page-storefront">
      {IS_DEV && <div className="dev-ribbon" data-testid="status-development">Preview catalogue · Secure checkout activates when the Render backend is configured.</div>}
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={startShopping} aria-label="Next Level notes home" data-testid="button-brand-home">
            <span className="brand-mark"><BookOpen size={21} strokeWidth={1.7} /></span>
            <span><span className="brand-name">Next Level <span>notes</span></span><span className="brand-tagline">Your study shelf, sorted</span></span>
          </button>
          <label className="header-search" data-testid="search-desktop">
            <Search size={16} />
            <input aria-label="Search notes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find notes, subjects, guides..." data-testid="input-search" />
          </label>
          <nav className="header-actions" aria-label="Store actions">
            <button className="nav-btn" onClick={() => { setCheckoutError(''); setModal(token ? 'account' : 'login'); }} data-testid="button-account">
              <GraduationCap size={17} /><span className="nav-label">{token ? 'My account' : 'Sign in'}</span>
            </button>
            {token && <button className="nav-btn" onClick={() => { setOrdersError(''); setModal('orders'); }} data-testid="button-orders"><FileText size={16} /><span className="nav-label">My orders</span></button>}
            <button className="nav-btn cart-nav" onClick={() => setCartOpen(true)} data-testid="button-open-cart" aria-label={`Shopping bag, ${cartCount} items`}>
              <ShoppingBag size={17} /><span className="nav-label">Bag</span><span className="cart-count" data-testid="text-cart-count">{cartCount}</span>
            </button>
          </nav>
        </div>
        <label className="header-search mobile-search" data-testid="search-mobile">
          <Search size={16} /><input aria-label="Search notes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your next study win..." data-testid="input-search-mobile" />
        </label>
      </header>

      <main>
        <div className="hero-wrap">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <div className="eyebrow">Small notes. Big clarity.</div>
              <h1 id="hero-title">Make your next<br />study session <em>count.</em></h1>
              <p>Thoughtful notes and revision guides, made by students who have been right where you are.</p>
              <button onClick={startShopping} className="hero-cta" data-testid="button-browse-notes">Find your notes <ArrowRight size={15} /></button>
              <div className="hero-stats">
                <span><ShieldCheck size={15} /> Student-made, carefully checked</span>
                <span><IndianRupee size={14} /> One-time, honest pricing</span>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-doodle"><Sparkles /></div>
              <span className="art-note note-one">one page at a time</span>
              <span className="art-note note-two">made for the real exam week</span>
              <div className="book-stack">
                <div className="book back" /><div className="book middle" />
                <div className="book front">
                  <div className="book-front-kicker">Your next chapter</div>
                  <div className="book-front-title">Study<br />with a little<br />more ease.</div>
                  <div className="book-front-lines"><i /><i /><i /></div>
                  <div className="book-seal"><BookOpen size={18} /></div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="shop-layout" id="study-shelf">
          <div className="section-intro">
            <div><div className="eyebrow">The study shelf</div><h2>Find your next good page.</h2><p>Useful, clear resources for the subjects on your mind.</p></div>
            <span className="result-count" data-testid="text-result-count">{loadingProducts ? 'Loading resources…' : `${filteredProducts.length} ${filteredProducts.length === 1 ? 'resource' : 'resources'}`}</span>
          </div>
          <div className="shop-tools">
            <div className="category-list" role="group" aria-label="Filter by resource type">
              {CATEGORIES.map((item) => (
                <button key={item.id} onClick={() => setCategory(item.id)} className={`category-chip${category === item.id ? ' active' : ''}`} aria-pressed={category === item.id} data-testid={`button-category-${item.id}`}>{item.label}</button>
              ))}
            </div>
            <label className="sort-control">Sort by
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products" data-testid="select-sort-products">
                <option value="featured">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option>
              </select><ChevronDown size={12} />
            </label>
          </div>
          <div className="product-grid" data-testid="grid-products">
            {loadingProducts && <div className="loading-bars" data-testid="loading-products">{[1, 2, 3, 4].map((item) => <div className="skeleton-card" key={item} />)}</div>}
            {!loadingProducts && productError && <div className="error-state" data-testid="error-products"><CircleHelp size={25} /><h3>The shelf is taking a moment.</h3><p>{productError}</p><button className="secondary-button" onClick={() => window.location.reload()} data-testid="button-retry-products">Try again</button></div>}
            {!loadingProducts && !productError && filteredProducts.map((product, index) => (
              <article className="product-card" key={product.id} data-testid={`card-product-${product.id}`}>
                <ProductCover product={product} index={index} />
                <div className="product-content">
                  <div className="product-subject">{product.subject}</div>
                  <h3 className="product-title" onClick={() => openProduct(product)} data-testid={`text-product-title-${product.id}`}>{product.title}</h3>
                  <p className="product-description">{product.description}</p>
                  <div className="product-bottom">
                    <span className="product-price" data-testid={`text-product-price-${product.id}`}>{money(product.price)}</span>
                    <div className="product-actions">
                      <button className="icon-action" aria-label={`View ${product.title}`} onClick={() => openProduct(product)} data-testid={`button-view-product-${product.id}`}><BookOpen size={15} /></button>
                      <button className="add-action" onClick={() => addToCart(product)} data-testid={`button-add-product-${product.id}`}><Plus size={14} /> Add</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {!loadingProducts && !productError && filteredProducts.length === 0 && <div className="empty-state" data-testid="empty-products"><Search size={25} /><h3>No pages found just yet.</h3><p>Try a different subject or clear your filters.</p><button className="secondary-button" onClick={() => { setQuery(''); setCategory('all'); }} data-testid="button-clear-filters">Clear search &amp; filters</button></div>}
          </div>
          <div className="trust-strip">
            <div className="trust-item"><div className="trust-icon"><FileText size={18} /></div><div><strong>Made to make sense</strong><span>Clear notes, built for actual revision.</span></div></div>
            <div className="trust-item"><div className="trust-icon"><LockKeyhole size={18} /></div><div><strong>Simple, secure checkout</strong><span>Protected UPI payment, when enabled.</span></div></div>
            <div className="trust-item"><div className="trust-icon"><ArrowDownToLine size={18} /></div><div><strong>Keep it close</strong><span>Approved orders stay in your account.</span></div></div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div><div className="footer-brand">Next Level notes</div><div>Good notes for the work you put in.</div></div>
        <div className="footer-support">Questions about a resource? {supportHref ? <a href={supportHref} target={supportHref.startsWith('http') ? '_blank' : undefined} rel="noreferrer" data-testid="link-support">{supportLabel}</a> : <span data-testid="text-support-unavailable">Our student support team is here to help.</span>}</div>
        <div>© {new Date().getFullYear()} Next Level notes</div>
      </footer>

      {cartOpen && <>
        <button className="drawer-backdrop" aria-label="Close bag" onClick={() => setCartOpen(false)} data-testid="button-close-cart-backdrop" />
        <aside className="cart-drawer" aria-label="Your bag" data-testid="drawer-cart">
          <div className="drawer-head"><div><h2>Your study bag</h2><p className="drawer-sub">{cartCount} {cartCount === 1 ? 'resource' : 'resources'} set aside</p></div><button className="close-button" onClick={() => setCartOpen(false)} aria-label="Close bag" data-testid="button-close-cart"><X size={17} /></button></div>
          <div className="drawer-items">
            {cart.length === 0 ? <div className="cart-empty"><div><ShoppingCart size={27} /><h3>A little room for notes.</h3><p>Your study bag is waiting for its first resource.</p><button className="secondary-button" onClick={() => { setCartOpen(false); startShopping(); }} data-testid="button-cart-browse">Browse the shelf</button></div></div> :
              cart.map((line) => {
                const product = products.find((item) => item.id === line.productId);
                if (!product) return null;
                return <div className="cart-row" key={line.productId} data-testid={`row-cart-item-${product.id}`}>
                  <div className="cart-cover"><BookOpen size={22} /></div>
                  <div className="cart-details"><strong>{product.title}</strong><span>{product.subject} · {classify(product.type)}</span>
                    <div className="cart-line-foot"><div className="qty-controls">
                      <button onClick={() => changeQuantity(product.id, -1)} aria-label={`Decrease ${product.title} quantity`} data-testid={`button-quantity-minus-${product.id}`}><Minus size={12} /></button>
                      <span data-testid={`text-quantity-${product.id}`}>{line.qty}</span>
                      <button onClick={() => changeQuantity(product.id, 1)} aria-label={`Increase ${product.title} quantity`} data-testid={`button-quantity-plus-${product.id}`}><Plus size={12} /></button>
                    </div><strong>{money(product.price * line.qty)}</strong></div>
                    <button className="remove-button" onClick={() => removeFromCart(product.id)} data-testid={`button-remove-cart-${product.id}`}>Remove</button>
                  </div>
                </div>;
              })}
          </div>
          <div className="drawer-foot"><div className="subtotal-line"><span>Subtotal</span><strong data-testid="text-cart-total">{money(cartTotal)}</strong></div>
            <button className="primary-button wide" onClick={() => void beginCheckout()} disabled={cart.length === 0} data-testid="button-checkout">Continue to checkout <ArrowRight size={15} /></button>
            <p className="fine-print">Your exact total is confirmed by our secure checkout service.</p>
          </div>
        </aside>
      </>}

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }} data-testid={`overlay-${modal}`}>
        {modal === 'login' && <section className="modal" role="dialog" aria-modal="true" aria-labelledby="login-title" data-testid="dialog-login">
          <div className="modal-top"><div><h2 id="login-title">Your notes, in one place.</h2><p className="modal-lead">Sign in to follow your orders and find approved downloads whenever you need them.</p></div><button className="close-button" onClick={() => setModal(null)} aria-label="Close sign in" data-testid="button-close-login"><X size={17} /></button></div>
          {IS_DEV ? <div className="modal-message" data-testid="status-login-development">Google sign-in and purchasing activate after the Render backend is configured. This preview catalogue cannot create a real account or order.</div> :
            !API_BASE ? <div className="modal-message" data-testid="status-login-unconfigured">Google sign-in activates after the Render backend is configured for this storefront.</div> :
              !GOOGLE_CLIENT_ID ? <div className="modal-message error" data-testid="status-google-config">Google sign-in is not configured. Please try again later or contact support.</div> :
                <><div className="google-slot" id="google-signin-button" data-testid="google-signin-button" /><p className="fine-print">Your Google identity is verified securely by the Next Level notes service.</p></>}
          {checkoutError && <div className="modal-message error" role="alert" data-testid="status-auth-error">{checkoutError}</div>}
          <button className="secondary-button wide" onClick={() => setModal(null)} data-testid="button-login-continue-shopping">Continue browsing</button>
        </section>}

        {modal === 'account' && <section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title" data-testid="dialog-account">
          <div className="modal-top"><div><h2 id="account-title">Your account</h2><p className="modal-lead">Your study resources and order updates live here.</p></div><button className="close-button" onClick={() => setModal(null)} aria-label="Close account" data-testid="button-close-account"><X size={17} /></button></div>
          <div className="account-card"><strong data-testid="text-account-name">{user?.name || 'Signed in with Google'}</strong><span data-testid="text-account-email">{user?.email || 'Your secure Next Level notes session is active.'}</span></div>
          <div className="modal-actions"><button className="primary-button" onClick={() => setModal('orders')} data-testid="button-account-orders">My orders <ArrowRight size={14} /></button><button className="secondary-button" onClick={logout} data-testid="button-logout">Sign out</button></div>
        </section>}

        {modal === 'product' && selectedProduct && <section className="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" data-testid={`dialog-product-${selectedProduct.id}`}>
          <div className="modal-top"><span /><button className="close-button" onClick={() => { setModal(null); setSelectedProduct(null); }} aria-label="Close resource details" data-testid="button-close-product"><X size={17} /></button></div>
          <div className="detail-layout">
            <ProductCover product={selectedProduct} index={Math.max(products.indexOf(selectedProduct), 0)} large />
            <div className="detail-copy"><div className="detail-kind">{classify(selectedProduct.type)} · {selectedProduct.subject}</div><h2 id="detail-title" data-testid="text-detail-title">{selectedProduct.title}</h2>
              <p className="detail-description" data-testid="text-detail-description">{selectedProduct.description}</p>
              <div className="detail-meta"><Check size={14} /> Digital resource · ready after order approval</div>
              <div className="product-bottom"><span className="detail-price">{money(selectedProduct.price)}</span>
                <button className="primary-button" onClick={() => addToCart(selectedProduct, true)} data-testid={`button-add-detail-${selectedProduct.id}`}><ShoppingBag size={15} /> Add to bag</button>
              </div>
            </div>
          </div>
        </section>}

        {modal === 'checkout' && <section className="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" data-testid="dialog-checkout">
          <div className="modal-top"><div><h2 id="checkout-title">A secure last step.</h2><p className="modal-lead">Pay the exact quoted amount, then add your UPI transaction reference.</p></div><button className="close-button" onClick={() => setModal(null)} aria-label="Close checkout" data-testid="button-close-checkout"><X size={17} /></button></div>
          {IS_DEV ? <div className="modal-message" data-testid="status-checkout-development">Checkout is a preview here. Real sign-in, UPI payment and order submission activate once the Render backend is configured. No order has been placed.</div> :
            quoteLoading ? <div className="inline-loading" data-testid="loading-checkout"><LoaderCircle size={18} /> Preparing your secure UPI quote…</div> :
              checkoutError && !quote ? <div className="modal-message error" role="alert" data-testid="status-checkout-error">{checkoutError}</div> :
                quote ? <form onSubmit={(event) => void submitOrder(event)} data-testid="form-checkout">
                  <div className="payment-details">
                    <div className="payment-total"><span>Server-verified total</span><strong data-testid="text-quote-total">{money(quote.total)}</strong></div>
                    <img className="checkout-qr" src={quote.qrDataUrl} alt="UPI QR code for the quoted total" data-testid="img-payment-qr" />
                    <div className="upi-line">UPI ID: <strong data-testid="text-upi-id">{quote.upiId || settings.upiId || 'Shown in your payment app'}</strong></div>
                    <a className="secondary-button wide" href={quote.upiUri} data-testid="link-pay-upi">Open a UPI app <ArrowRight size={14} /></a>
                    <p className="fine-print">Quote expires {new Date(quote.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Reopen checkout for a fresh QR if needed.</p>
                  </div>
                  <label className="input-label" htmlFor="utr-number">UPI transaction reference / UTR</label>
                  <input className="text-input" id="utr-number" value={utr} onChange={(event) => setUtr(event.target.value)} maxLength={80} autoComplete="off" placeholder="Enter the reference from your UPI app" data-testid="input-utr" />
                  {checkoutError && <div className="modal-message error" role="alert" data-testid="status-checkout-error">{checkoutError}</div>}
                  <button className="primary-button wide" type="submit" disabled={orderSending} data-testid="button-submit-order">{orderSending ? <><LoaderCircle size={15} /> Sending order…</> : <>I have paid — submit order <ArrowRight size={15} /></>}</button>
                </form> : <div className="modal-message error" data-testid="status-checkout-unavailable">Your secure payment quote is not available. Please try checkout again.</div>}
          {!IS_DEV && checkoutError && !quote && token && <button className="secondary-button wide" onClick={() => void beginCheckout()} data-testid="button-retry-quote">Try secure checkout again</button>}
          <p className="fine-print">Payments are reviewed by the store. Download access appears only after approval.</p>
        </section>}

        {modal === 'orders' && <section className="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="orders-title" data-testid="dialog-orders">
          <div className="modal-top"><div><h2 id="orders-title">Your orders</h2><p className="modal-lead">Payment status and approved resource downloads, all together.</p></div><button className="close-button" onClick={() => setModal(null)} aria-label="Close orders" data-testid="button-close-orders"><X size={17} /></button></div>
          {!token ? <div className="inline-empty" data-testid="status-orders-signed-out">Sign in to see your order history.</div> :
            ordersLoading ? <div className="inline-loading" data-testid="loading-orders"><LoaderCircle size={18} /> Loading your order history…</div> :
              ordersError ? <div className="inline-error" role="alert" data-testid="error-orders">{ordersError}<br /><button className="secondary-button" onClick={() => void fetchOrders()} data-testid="button-retry-orders">Try again</button></div> :
                orders.length === 0 ? <div className="inline-empty" data-testid="empty-orders"><ShoppingBag size={22} /><p>No orders yet. The right notes are waiting on the shelf.</p><button className="secondary-button" onClick={() => { setModal(null); startShopping(); }} data-testid="button-orders-browse">Browse study resources</button></div> :
                  <div className="order-list" data-testid="list-orders">{orders.map((order) => (
                    <article className="order-card" key={order.id} data-testid={`card-order-${order.id}`}>
                      <div className="order-head"><div><div className="order-number" data-testid={`text-order-id-${order.id}`}>{order.id}</div><div className="order-date">{new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div></div><span className={`status-badge ${order.status}`} data-testid={`status-order-${order.id}`}>{order.status}</span></div>
                      <div className="order-items">{(order.items || []).map((item, index) => <div className="order-product" key={`${item.productId}-${index}`}><span>{item.title || products.find((product) => product.id === item.productId)?.title || item.productId} × {item.qty || 1}</span><span>{item.price ? money(item.price * (item.qty || 1)) : ''}</span></div>)}</div>
                      <div className="order-footer"><span>UPI reference · {order.utr}</span><strong>{money(order.total)}</strong></div>
                      {['paid', 'delivered'].includes(order.status) && <div className="download-row">{(order.items || []).map((item, index) => <button className="download-button" key={`${item.productId}-download-${index}`} disabled={downloadBusy === `${order.id}:${item.productId}`} onClick={() => void downloadItem(order, item)} data-testid={`button-download-${order.id}-${item.productId}`}><ArrowDownToLine size={13} />{downloadBusy === `${order.id}:${item.productId}` ? 'Preparing…' : `Download ${item.title || products.find((product) => product.id === item.productId)?.title || 'resource'}`}</button>)}</div>}
                    </article>
                  ))}</div>}
          <div className="modal-actions"><button className="secondary-button" onClick={() => void fetchOrders()} disabled={ordersLoading || !token} data-testid="button-refresh-orders">Refresh status</button><button className="primary-button" onClick={() => setModal('account')} data-testid="button-orders-account">Account</button></div>
        </section>}
      </div>}

      {toast && <div className="toast show" role="status" data-testid="status-toast">{toast}</div>}
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
