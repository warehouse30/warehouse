import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

function userFromToken(token: string, email: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: Number(payload.sub) || 0,
      email,
      full_name: email.split('@')[0],
      role: payload.role || 'worker',
      is_active: true,
    };
  } catch {
    return { id: 0, email, full_name: email, role: 'admin', is_active: true };
  }
}

export async function login(email: string, password: string) {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);
  const { data } = await api.post('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const token = data.access_token;
  localStorage.setItem('token', token);

  let user = data.user;
  if (!user) {
    user = userFromToken(token, email);
    try {
      const me = await api.get('/auth/me');
      if (me.data) user = me.data;
    } catch {
      /* keep JWT user */
    }
  }

  localStorage.setItem('user', JSON.stringify(user));
  window.dispatchEvent(new Event('warehouse-auth'));
  return user;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('warehouse-auth'));
}

export function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}
