// API конфигурация
// Используем относительный путь для избежания проблем с CORS (www vs non-www)
// Это работает, потому что nginx проксирует /api на backend
const API_BASE_URL = '/api';
const API_DEBUG = false;

// Функция для работы с API
class ApiClient {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.token = localStorage.getItem('authToken');
    }

    // Установка токена
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('authToken', token);
        } else {
            localStorage.removeItem('authToken');
        }
    }

    // Получение токена
    getToken() {
        return this.token || localStorage.getItem('authToken');
    }

    // Базовый метод для запросов
    async request(endpoint, options = {}) {
        // Формируем полный URL
        // Если baseURL относительный (начинается с /), используем его как есть
        // Если baseURL абсолютный, объединяем его с endpoint
        let url;
        if (this.baseURL.startsWith('/')) {
            // Относительный путь - endpoint уже должен начинаться с /
            url = `${this.baseURL}${endpoint}`;
        } else {
            // Абсолютный URL
            url = `${this.baseURL}${endpoint}`;
        }
        const token = this.getToken();

        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
                ...options.headers,
            },
        };

        const method = (options.method || 'GET').toUpperCase();
        if (typeof document !== 'undefined' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            try {
                const cm = document.cookie.match(/(?:^|; )lbl_csrf=([^;]*)/);
                if (cm) {
                    config.headers['X-CSRF-Token'] = decodeURIComponent(cm[1]);
                }
            } catch (e) { /* noop */ }
        }
        if (config.credentials === undefined) {
            config.credentials = 'include';
        }

        try {
            if (API_DEBUG) {
                console.log('API Request:', url, config);
            }
            const response = await fetch(url, config);
            if (API_DEBUG) {
                console.log('API Response status:', response.status, response.statusText);
                console.log('API Response headers:', Object.fromEntries(response.headers.entries()));
            }

            if (response.status === 502 || response.status === 503 || response.status === 504) {
                throw new Error(
                    'Сервер API временно недоступен (ошибка ' + response.status + '). ' +
                    'Обычно это значит, что бэкенд не запущен или nginx не может до него достучаться. ' +
                    'Попробуйте позже или напишите в поддержку.'
                );
            }
            
            // Проверяем тип контента перед парсингом JSON
            const contentType = response.headers.get('content-type');
            let data;
            let text = '';
            
            try {
                // Сначала получаем текст ответа (можно вызвать только один раз!)
                text = await response.text();
                if (API_DEBUG) {
                    console.log('API Response raw text:', text);
                    console.log('API Response content-type:', contentType);
                }
                
                if (text && text.trim()) {
                    // Пробуем распарсить как JSON
                    try {
                        data = JSON.parse(text);
                        if (API_DEBUG) {
                            console.log('Successfully parsed JSON');
                        }
                    } catch (parseError) {
                        if (API_DEBUG) {
                            console.error('Failed to parse as JSON:', parseError);
                            console.error('Response text:', text.substring(0, 500)); // Первые 500 символов
                        }
                        // Если не JSON, но статус OK, возвращаем объект с текстом
                        if (response.ok) {
                            data = { message: text };
                        } else {
                            // Если это HTML (ошибка 404 или другая), пытаемся извлечь информацию
                            if (text.includes('<html>') || text.includes('<!DOCTYPE') || text.includes('<html ') || /<body[\s>]/i.test(text)) {
                                // Это HTML страница ошибки
                                let errorDetail = 'Ошибка сервера';
                                if (response.status === 404) {
                                    errorDetail = 'Эндпоинт не найден (404)';
                                } else if (response.status === 500) {
                                    errorDetail = 'Внутренняя ошибка сервера (500)';
                                } else if (response.status === 502) {
                                    errorDetail = 'Шлюз недоступен — API-бэкенд не отвечает (502)';
                                } else if (response.status === 503) {
                                    errorDetail = 'Сервис временно недоступен (503)';
                                } else if (response.status === 504) {
                                    errorDetail = 'Таймаут шлюза (504)';
                                } else if (response.status === 400) {
                                    errorDetail = 'Неверный запрос (400)';
                                } else if (response.status === 401) {
                                    errorDetail = 'Не авторизован (401)';
                                } else if (response.status === 403) {
                                    errorDetail = 'Доступ запрещен (403)';
                                }
                                throw new Error(`${errorDetail}. Статус: ${response.status}`);
                            } else {
                                throw new Error(`Ошибка парсинга ответа сервера: ${parseError.message}. Ответ: ${text.substring(0, 200)}`);
                            }
                        }
                    }
                } else {
                    // Пустой ответ
                    data = {};
                }
            } catch (parseError) {
                if (API_DEBUG) {
                    console.error('Response parsing error:', parseError);
                }
                // Если не удалось распарсить, но статус OK, возвращаем пустой объект
                if (response.ok) {
                    if (API_DEBUG) {
                        console.warn('Response OK but parsing failed, returning empty object');
                    }
                    data = {};
                } else {
                    // Уже сформированная ошибка (HTML-страница nginx и т.п.) — не оборачиваем
                    if (parseError instanceof Error && parseError.message && parseError.message.indexOf('Статус:') !== -1) {
                        throw parseError;
                    }
                    throw new Error(`Ошибка парсинга ответа сервера: ${parseError.message}`);
                }
            }

            if (API_DEBUG) {
                console.log('API Response data:', data);
                console.log('API Response data type:', typeof data);
                console.log('API Response requires_2fa:', data.requires_2fa, typeof data.requires_2fa);
            }

            // Для логина с 2FA - не выбрасываем ошибку, если requires_2fa = true
            // Это нормальный ответ, который требует дополнительного шага
            // Проверяем как boolean true, так и строку "true"
            if (endpoint === '/login' && response.ok) {
                // Проверяем requires_2fa в разных форматах
                const requires2FA = data.requires_2fa === true || 
                                   data.requires_2fa === 'true' || 
                                   data.requires_2fa === 1 ||
                                   String(data.requires_2fa).toLowerCase() === 'true';
                
                if (requires2FA) {
                    console.log('2FA required detected, returning response without error');
                    // Убеждаемся, что это boolean
                    data.requires_2fa = true;
                    return data;
                }
            }

            // Для остальных случаев проверяем статус
            if (!response.ok) {
                const errorMsg = data.detail || data.message || `Ошибка запроса (${response.status})`;
                console.error('API Error response:', errorMsg);
                const apiError = new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
                apiError.data = data;
                apiError.status = response.status;
                throw apiError;
            }

            return data;
        } catch (error) {
            if (API_DEBUG) {
                console.error('API Error caught:', error);
                console.error('Error name:', error.name);
                console.error('Error message:', error.message);
            }
            
            // Если это ошибка сети, пробрасываем её дальше с понятным сообщением
            if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                const networkError = new Error('Ошибка сети. Проверьте подключение к интернету и доступность сервера.');
                networkError.name = 'NetworkError';
                networkError.originalError = error;
                throw networkError;
            }
            
            // Если ошибка уже имеет сообщение, пробрасываем её
            if (error.message) {
                throw error;
            }
            
            // Иначе создаем общую ошибку
            throw new Error(error.toString() || 'Неизвестная ошибка');
        }
    }

    // GET запрос
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    // POST запрос
    async post(endpoint, data, options = {}) {
        // Если data - это FormData, не преобразуем в JSON
        if (data instanceof FormData) {
            const token = this.getToken();
            const url = `${this.baseURL}${endpoint}`;
            const config = {
                method: 'POST',
                headers: {
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                    ...options.headers,
                },
                body: data,
                credentials: 'include',
            };
            try {
                const cm = document.cookie.match(/(?:^|; )lbl_csrf=([^;]*)/);
                if (cm) {
                    config.headers['X-CSRF-Token'] = decodeURIComponent(cm[1]);
                }
            } catch (e) { /* noop */ }
            
            try {
                const response = await fetch(url, config);
                const text = await response.text();
                let responseData = {};
                
                if (text && text.trim()) {
                    try {
                        responseData = JSON.parse(text);
                    } catch (parseError) {
                        if (response.ok) {
                            responseData = { message: text };
                        } else {
                            throw new Error(`Ошибка парсинга ответа сервера: ${parseError.message}`);
                        }
                    }
                }
                
                if (!response.ok) {
                    const errorMsg = responseData.detail || responseData.message || `Ошибка запроса (${response.status})`;
                    throw new Error(errorMsg);
                }
                
                return responseData;
            } catch (error) {
                console.error('API Error (FormData):', error);
                throw error;
            }
        } else {
            return this.request(endpoint, {
                method: 'POST',
                body: JSON.stringify(data),
            });
        }
    }

    // PUT запрос
    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    // PATCH запрос
    async patch(endpoint, data) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    // DELETE запрос
    async delete(endpoint, data = null) {
        const options = { 
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        if (data) {
            options.body = JSON.stringify(data);
        }
        console.log('DELETE request:', endpoint, data);
        return this.request(endpoint, options);
    }

    // Регистрация
    async register(userData) {
        const response = await this.post('/register', userData);
        // КРИТИЧНО: Сохраняем токен автоматически после регистрации
        if (response && response.access_token) {
            this.setToken(response.access_token);
        }
        return response;
    }

    /** Публичный статус регистрации (без токена). */
    async getPublicRegistrationStatus() {
        return this.get('/public/registration-status');
    }

    /** Закрыть или открыть публичную регистрацию (оператор). */
    async setOperatorRegistrationClosed(closed) {
        return this.put('/operator/settings/registration', { closed: !!closed });
    }

    async submitBetaTestApplication(payload) {
        return this.post('/public/beta-test-application', payload);
    }

    async getOperatorBetaTestApplications(status = null) {
        const q = status ? `?status=${encodeURIComponent(status)}` : '';
        return this.get(`/operator/beta-test-applications${q}`);
    }

    async approveOperatorBetaTestApplication(id) {
        return this.post(`/operator/beta-test-applications/${id}/approve`, {});
    }

    async rejectOperatorBetaTestApplication(id, reason) {
        return this.post(`/operator/beta-test-applications/${id}/reject`, { reason: reason || null });
    }

    async revokeOperatorBetaTestApplication(id, reason) {
        return this.post(`/operator/beta-test-applications/${id}/revoke`, { reason: reason || null });
    }

    // Восстановление пароля
    async forgotPassword(email) {
        return this.post('/forgot-password', { email });
    }

    // Вход
    async login(email, password, twoFactorCode = null) {
        try {
            // Получаем информацию об устройстве
            const userAgent = navigator.userAgent || 'Неизвестно';
            let deviceInfo = 'Неизвестно';
            if (userAgent.includes('Chrome')) deviceInfo = 'Chrome';
            else if (userAgent.includes('Firefox')) deviceInfo = 'Firefox';
            else if (userAgent.includes('Safari')) deviceInfo = 'Safari';
            else if (userAgent.includes('Edge')) deviceInfo = 'Edge';
            
            if (userAgent.includes('Windows')) deviceInfo += ' на Windows';
            else if (userAgent.includes('Mac')) deviceInfo += ' на macOS';
            else if (userAgent.includes('Linux')) deviceInfo += ' на Linux';
            else if (userAgent.includes('Android')) deviceInfo += ' на Android';
            else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) deviceInfo += ' на iOS';
            
            const response = await this.post('/login', { 
                email, 
                password,
                two_factor_code: twoFactorCode,
                user_agent: userAgent,
                device_info: deviceInfo,
                location: 'Неизвестно' // Можно добавить определение местоположения через API
            });
            
            if (API_DEBUG) {
                console.log('Login response:', response);
            }
            
            // Если требуется 2FA, возвращаем ответ как есть
            if (response && response.requires_2fa === true) {
                if (API_DEBUG) console.log('2FA required, returning response');
                return response;
            }
            
            // Если есть токен, сохраняем его
            if (response && response.access_token) {
                this.setToken(response.access_token);
            }
            
            return response;
        } catch (error) {
            if (API_DEBUG) {
                console.error('Login error in api.js:', error);
            }
            // Если это ошибка сети, пробрасываем её
            if (error.message && (error.message.includes('NetworkError') || error.message.includes('fetch'))) {
                throw error;
            }
            // Для других ошибок тоже пробрасываем
            throw error;
        }
    }

    // Получение профиля
    async getProfile() {
        return this.get('/me');
    }

    // Обновление профиля
    async updateProfile(profileData) {
        return this.put('/profile', profileData);
    }

    // Выход
    logout() {
        this.setToken(null);
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        localStorage.removeItem('isLoggedIn');
    }

    // Проверка авторизации
    isAuthenticated() {
        return !!this.getToken();
    }

    // Создание заказа
    async createOrder(orderData) {
        return this.post('/orders', orderData);
    }

    // Получение заказов
    async getOrders(skip = 0, limit = 100) {
        return this.get(`/orders?skip=${skip}&limit=${limit}`);
    }

    // Получение чатов
    async getChats() {
        return this.get('/chats');
    }

    // Получение сообщений чата
    async getChatMessages(chatId, skip = 0, limit = 100) {
        return this.get(`/chats/${chatId}/messages?skip=${skip}&limit=${limit}`);
    }

    // Отправка сообщения в чат
    async sendChatMessage(chatId, message, imageUrl = null) {
        return this.post(`/chats/${chatId}/messages`, { message, image_url: imageUrl });
    }

    // Получить публичный VAPID ключ
    async getPushPublicKey() {
        return this.get('/push/public-key');
    }

    // Проверить наличие push-подписки
    async checkPushSubscription() {
        return this.get('/push/subscription');
    }

    // Сохранить push-подписку
    async savePushSubscription(subscription) {
        return this.post('/push/subscribe', subscription);
    }

    // Получение уведомлений
    async getNotifications(skip = 0, limit = 50) {
        return this.get(`/notifications?skip=${skip}&limit=${limit}`);
    }

    // Отметить уведомление как прочитанное
    async markNotificationRead(notificationId) {
        return this.put(`/notifications/${notificationId}/read`, {});
    }

    // Создать запрос на пополнение
    async createDepositRequest(amount) {
        return this.post('/deposit/request', { amount });
    }

    // Получить рефералов
    async getReferrals() {
        return this.get('/referrals');
    }

    // Получить статистику рефералов
    async getReferralStats() {
        return this.get('/referrals/stats');
    }

    // Получить бонусы
    async getBonuses() {
        return this.get('/bonuses');
    }

    async getLoyalty() {
        return this.get('/loyalty');
    }

    async getLoyaltyHistory(skip = 0, limit = 50, typeFilter = null) {
        const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
        if (typeFilter) {
            params.append('type_filter', typeFilter);
        }
        return this.get(`/loyalty/history?${params.toString()}`);
    }

    async convertPoints(points, orderAmount) {
        return this.post('/loyalty/convert', { points, order_amount: orderAmount });
    }

    async applyCoupon(code, orderAmount) {
        return this.post('/coupons/apply', { code, order_amount: orderAmount });
    }

    async validateCoupon(code, orderAmount) {
        return this.post('/coupons/validate', { code, order_amount: orderAmount });
    }

    // Операторские методы для промокодов
    async getOperatorCoupons(statusFilter = 'all') {
        // statusFilter может быть: 'active', 'inactive', 'all'
        const params = new URLSearchParams();
        if (statusFilter === 'active') {
            params.append('is_active', 'true');
        } else if (statusFilter === 'inactive') {
            params.append('is_active', 'false');
        }
        // Для 'all' не добавляем параметр is_active
        return this.get(`/operator/coupons?${params.toString()}`);
    }

    async createCoupon(couponData) {
        return this.post('/operator/coupons', couponData);
    }

    async updateCoupon(couponId, couponData) {
        return this.put(`/operator/coupons/${couponId}`, couponData);
    }

    async deleteCoupon(couponId) {
        return this.delete(`/operator/coupons/${couponId}`);
    }

    // Перевести реферальный баланс на основной
    async transferReferralBalance() {
        return this.post('/referral/transfer', {});
    }

    // Отправить отзыв
    async submitReview(platform, reviewUrl = null) {
        return this.post('/reviews/submit', { platform, review_url: reviewUrl });
    }

    // Получить статус отзывов
    async getReviewsStatus() {
        return this.get('/reviews/status');
    }

    // Получить достижения
    async getAchievements() {
        return this.get('/achievements');
    }

    // Получить файлы
    async getFiles() {
        return this.get('/files');
    }

    // Отправить код 2FA
    async send2FACode() {
        return this.post('/2fa/send-code', {});
    }

    // Проверить код 2FA
    async verify2FA(code) {
        return this.post('/2fa/verify', { code });
    }

    // Подписаться на рассылку
    async subscribeNewsletter() {
        return this.put('/newsletter/subscribe', {});
    }

    // Отписаться от рассылки
    async unsubscribeNewsletter() {
        return this.put('/newsletter/unsubscribe', {});
    }

    // ==================== Операторские методы ====================
    
    // Получить всех пользователей
    async getOperatorUsers(skip = 0, limit = 100, search = '', filters = {}) {
        const queryParams = new URLSearchParams();
        queryParams.append('skip', String(skip));
        queryParams.append('limit', String(limit));
        if (search) queryParams.append('search', search);
        const f = filters || {};
        if (f.role) queryParams.append('role', f.role);
        if (f.has_orders) queryParams.append('has_orders', f.has_orders);
        if (f.city) queryParams.append('city', f.city);
        if (f.created_from) queryParams.append('created_from', f.created_from);
        if (f.created_to) queryParams.append('created_to', f.created_to);
        if (f.beta_only) queryParams.append('beta_only', 'true');
        if (f.segment) queryParams.append('segment', f.segment);
        return this.get(`/operator/users?${queryParams.toString()}`);
    }

    async updateOperatorChatMeta(chatId, payload) {
        return this.put(`/operator/chats/${chatId}`, payload);
    }

    async getOperatorUser(userId) {
        return this.get(`/operator/users/${userId}`);
    }

    async updateOperatorUserInternalNotes(userId, notes) {
        return this.put(`/operator/users/${userId}/internal-notes`, { notes });
    }

    // Получить чаты пользователя
    async getOperatorUserChats(userId) {
        return this.get(`/operator/users/${userId}/chats`);
    }

    async getOperatorBootstrap() {
        return this.get('/operator/bootstrap');
    }

    // Получить все заказы
    async getOperatorOrders(filters = {}) {
        const normalized = typeof filters === 'string' ? { statusFilter: filters } : (filters || {});
        const queryParams = new URLSearchParams();
        if (normalized.skip != null) queryParams.append('skip', String(normalized.skip));
        if (normalized.limit != null) queryParams.append('limit', String(normalized.limit));
        if (normalized.statusFilter) queryParams.append('status_filter', normalized.statusFilter);
        if (normalized.search) queryParams.append('search', normalized.search);
        if (normalized.operatorId != null && normalized.operatorId !== '') queryParams.append('operator_id', String(normalized.operatorId));
        if (normalized.courierId != null && normalized.courierId !== '') queryParams.append('courier_id', String(normalized.courierId));
        if (normalized.tag) queryParams.append('tag', normalized.tag);
        if (normalized.priorityMin != null && normalized.priorityMin !== '') queryParams.append('priority_min', String(normalized.priorityMin));
        if (normalized.dateFrom) queryParams.append('date_from', normalized.dateFrom);
        if (normalized.dateTo) queryParams.append('date_to', normalized.dateTo);
        if (normalized.sortBy) queryParams.append('sort_by', normalized.sortBy);
        if (normalized.sortDir) queryParams.append('sort_dir', normalized.sortDir);
        const url = `/operator/orders${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        return this.get(url);
    }

    // Получить заказ по ID
    async getOperatorOrder(orderId) {
        return this.get(`/operator/orders/${orderId}`);
    }

    // Обновить статус заказа
    async updateOperatorOrderStatus(orderId, status, trackingNumber = null) {
        return this.put(`/operator/orders/${orderId}/status`, {
            status: status,
            tracking_number: trackingNumber
        });
    }

    // Установить цену заказа
    async setOperatorOrderPrice(orderId, amount) {
        return this.put(`/operator/orders/${orderId}/set-price`, { amount });
    }

    // Подтвердить оплату заказа
    async confirmOperatorOrderPayment(orderId) {
        return this.post(`/operator/orders/${orderId}/confirm-payment`, {});
    }

    async assignOperatorToOrder(orderId, operatorId = null) {
        return this.post(`/operator/orders/${orderId}/assign-operator`, { operator_id: operatorId });
    }

    async assignCourierToOrder(orderId, courierId) {
        return this.post(`/operator/orders/${orderId}/assign-courier`, { courier_id: courierId });
    }

    async deleteOperatorOrder(orderId) {
        return this.delete(`/operator/orders/${orderId}`);
    }

    async createOperatorOrder(orderData) {
        return this.post('/operator/orders', orderData);
    }

    // Получить все пополнения
    async getOperatorDeposits(params = {}) {
        const normalized = typeof params === 'string' ? { status: params } : (params || {});
        const queryParams = new URLSearchParams();
        if (normalized.status) queryParams.append('status', normalized.status);
        if (normalized.user_search) queryParams.append('user_search', normalized.user_search);
        if (normalized.date_from) queryParams.append('date_from', normalized.date_from);
        if (normalized.date_to) queryParams.append('date_to', normalized.date_to);
        if (normalized.amount_min != null && normalized.amount_min !== '') {
            queryParams.append('amount_min', String(normalized.amount_min));
        }
        if (normalized.amount_max != null && normalized.amount_max !== '') {
            queryParams.append('amount_max', String(normalized.amount_max));
        }
        const qs = queryParams.toString();
        return this.get(`/operator/deposits${qs ? `?${qs}` : ''}`);
    }

    async getOperatorDepositRequests(statusFilter = '', extra = {}) {
        const queryParams = new URLSearchParams();
        if (statusFilter) queryParams.append('status_filter', statusFilter);
        const opts = extra || {};
        if (opts.user_search) queryParams.append('user_search', opts.user_search);
        if (opts.date_from) queryParams.append('date_from', opts.date_from);
        if (opts.date_to) queryParams.append('date_to', opts.date_to);
        if (opts.amount_min != null && opts.amount_min !== '') queryParams.append('amount_min', String(opts.amount_min));
        if (opts.amount_max != null && opts.amount_max !== '') queryParams.append('amount_max', String(opts.amount_max));
        const qs = queryParams.toString();
        return this.get(`/operator/deposit-requests${qs ? `?${qs}` : ''}`);
    }

    // Одобрить пополнение
    async approveDeposit(depositId, comment) {
        const body = comment ? { comment } : {};
        return this.post(`/operator/deposit/${depositId}/approve`, body);
    }

    // Отклонить пополнение
    async rejectDeposit(depositId, comment) {
        const body = comment ? { comment } : {};
        return this.post(`/operator/deposit/${depositId}/reject`, body);
    }

    async getOperatorUserTimeline(userId, limit) {
        const q = limit ? `?limit=${limit}` : "";
        return this.get(`/operator/users/${userId}/timeline${q}`);
    }

    async getOperatorAllChats(skip = 0, limit = 100) {
        return this.get(`/operator/chats?skip=${skip}&limit=${limit}`);
    }

    // Получить все чаты техподдержки
    async getOperatorSupportChats() {
        return this.get('/operator/support/chats');
    }

    // Получить сообщения чата (оператор)
    async getOperatorChatMessages(chatId) {
        return this.get(`/operator/chats/${chatId}/messages`);
    }

    // Отправить сообщение в чат (оператор)
    async sendOperatorChatMessage(chatId, message) {
        return this.post(`/operator/chats/${chatId}/messages`, { message });
    }

    // Загрузить фото в чат (оператор)
    async uploadOperatorChatImage(chatId, file, caption = "") {
        const formData = new FormData();
        formData.append("image", file);
        if (caption) formData.append("caption", caption);
        return this.post(`/operator/chats/${chatId}/upload-image`, formData);
    }

    async closeOperatorChat(chatId, payload = {}) {
        return this.put(`/operator/chats/${chatId}/close`, payload || {});
    }

    async escalateOperatorChat(chatId, note) {
        return this.post(`/operator/chats/${chatId}/escalate`, { note: note || null });
    }

    async getOperatorFeatureFlags() {
        return this.get("/operator/settings/feature-flags");
    }

    async updateOperatorFeatureFlags(flags) {
        return this.put("/operator/settings/feature-flags", flags);
    }

    async setOperatorMaintenanceMode(enabled) {
        return this.put("/operator/settings/maintenance", { enabled: Boolean(enabled) });
    }

    async getOperatorDuplicateEmails() {
        return this.get("/operator/users/duplicate-emails");
    }

    getOperatorUserGdprExportUrl(userId) {
        return `/api/operator/users/${userId}/gdpr-export`;
    }

    async downloadOperatorUserGdprExport(userId) {
        const blob = await this._fetchOperatorBlob(`/operator/users/${userId}/gdpr-export`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `user_${userId}_gdpr.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async verifyOperatorPassword(password) {
        return this.post('/operator/auth/verify-password', { password });
    }

    async requestOperatorUserGdprDeletion(userId, note) {
        return this.post(`/operator/users/${userId}/gdpr-deletion-request`, { note: note || null });
    }

    async cancelOperatorUserGdprDeletionRequest(userId) {
        return this.delete(`/operator/users/${userId}/gdpr-deletion-request`);
    }

    async importOperatorOrdersCsv(csv, dryRun = false) {
        return this.post('/operator/orders/import-csv', { csv, dry_run: dryRun });
    }

    getOperatorOrderInvoiceUrl(orderId, { companyInn, companyName } = {}) {
        const q = new URLSearchParams();
        if (companyInn) q.set('company_inn', companyInn);
        if (companyName) q.set('company_name', companyName);
        const qs = q.toString();
        return `/api/operator/orders/${orderId}/invoice${qs ? `?${qs}` : ''}`;
    }

    async refundOperatorOrder(orderId, payload) {
        return this.post(`/operator/orders/${orderId}/refund`, payload);
    }

    async getOperatorFinanceRevenueBreakdown(days = 30) {
        return this.get(`/operator/finance/revenue-breakdown?days=${encodeURIComponent(String(days))}`);
    }

    getOperatorFinanceAccountingExportUrl(days = 90) {
        return `/api/operator/finance/accounting-export?days=${encodeURIComponent(String(days))}`;
    }

    async getOperatorFinanceYookassaWebhooks(limit = 50) {
        return this.get(`/operator/finance/yookassa-webhooks?limit=${encodeURIComponent(String(limit))}`);
    }

    async bulkApproveOperatorDeposits(depositIds, comment) {
        return this.post('/operator/deposits/bulk-approve', {
            deposit_ids: depositIds,
            comment: comment || null,
        });
    }

    async runOperatorPaymentRemindersJob(dryRun = false) {
        return this.post(`/operator/jobs/payment-reminders?dry_run=${dryRun ? 'true' : 'false'}`);
    }

    async postOperatorChatTyping(chatId) {
        return this.post(`/operator/chats/${chatId}/typing`, {});
    }

    async getOperatorTelegramOpsSettings() {
        return this.get('/operator/settings/telegram-ops');
    }

    async updateOperatorTelegramOpsSettings(body) {
        return this.put('/operator/settings/telegram-ops', body);
    }

    async testOperatorTelegramOpsNotify() {
        return this.post('/operator/settings/telegram-ops/test', {});
    }

    async getOperatorAdminLogsTail(lines = 200) {
        return this.get(`/operator/admin/logs-tail?lines=${encodeURIComponent(String(lines))}`);
    }

    async downloadOperatorOrderInvoicePdf(orderId, { companyInn, companyName } = {}) {
        const q = new URLSearchParams();
        if (companyInn) q.set('company_inn', companyInn);
        if (companyName) q.set('company_name', companyName);
        const qs = q.toString();
        return this._fetchOperatorBlob(`/operator/orders/${orderId}/invoice${qs ? `?${qs}` : ''}`);
    }

    // Получить QR код
    async getOperatorQR(qrData) {
        return this.get(`/operator/qr/${encodeURIComponent(qrData)}`);
    }

    async getOperatorOrderQrMeta(orderId) {
        return this.get(`/operator/orders/${orderId}/qr-meta`);
    }

    async _fetchOperatorBlob(endpoint, options = {}) {
        let url;
        if (this.baseURL.startsWith('/')) {
            url = `${this.baseURL}${endpoint}`;
        } else {
            url = `${this.baseURL}${endpoint}`;
        }
        const token = this.getToken();
        const headers = {
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
        };
        const method = (options.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            try {
                const cm = document.cookie.match(/(?:^|; )lbl_csrf=([^;]*)/);
                if (cm) headers['X-CSRF-Token'] = decodeURIComponent(cm[1]);
            } catch (e) {
                /* noop */
            }
        }
        const response = await fetch(url, {
            ...options,
            method,
            headers,
            credentials: options.credentials || 'include',
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(text || `HTTP ${response.status}`);
        }
        return response.blob();
    }

    downloadBlob(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
    }

    async downloadOperatorOrderQrLabelPdf(orderId, { kind = 'internal', labelMm = 50 } = {}) {
        const lm = labelMm >= 60 ? 70 : 50;
        return this._fetchOperatorBlob(
            `/operator/orders/${orderId}/qr-label.pdf?kind=${encodeURIComponent(kind)}&label_mm=${lm}`
        );
    }

    async downloadOperatorQrLabelsPdf({ orderIds, kind = 'internal', labelMm = 50 }) {
        const lm = labelMm >= 60 ? 70 : 50;
        return this._fetchOperatorBlob('/operator/orders/qr-labels.pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_ids: orderIds,
                kind,
                label_mm: lm,
            }),
        });
    }

    // Загрузить файл для заказа (оператор)
    async uploadOperatorOrderFile(orderId, file) {
        const formData = new FormData();
        formData.append('file', file);
        return this.post(`/operator/orders/${orderId}/upload-file`, formData);
    }

    async getOperatorOrderFileVersions(orderId) {
        return this.get(`/operator/orders/${orderId}/file-versions`);
    }

    async getOperatorOrdersDeadlineCalendar(days = 7) {
        return this.get(`/operator/orders/deadline-calendar?days=${encodeURIComponent(String(days))}`);
    }

    async getCourierRouteToday() {
        return this.get('/courier/route/today');
    }

    async completeCourierOrder(orderId, proofPhotoFile, signatureFile) {
        if (proofPhotoFile || signatureFile) {
            const formData = new FormData();
            if (proofPhotoFile) formData.append('proof_photo', proofPhotoFile);
            if (signatureFile) formData.append('signature_image', signatureFile);
            return this.post(`/courier/orders/${orderId}/complete`, formData);
        }
        return this.post(`/courier/orders/${orderId}/complete`, {});
    }

    // Редактировать заказ (оператор)
    async editOperatorOrder(orderId, orderData) {
        return this.put(`/operator/orders/${orderId}/edit`, orderData);
    }

    async createCourier(courierData) {
        return this.post('/operator/couriers', courierData);
    }

    // Создать пользователя (админ)
    async createUser(userData) {
        return this.post('/operator/users', userData);
    }

    // Обновить пользователя (админ)
    async updateUser(userId, userData) {
        return this.put(`/operator/users/${userId}`, userData);
    }

    async deleteUser(userId) {
        return this.delete(`/operator/users/${userId}`);
    }

    async getOperatorStaff(roles = [], activeOnly = true) {
        const queryParams = new URLSearchParams();
        if (roles && roles.length) queryParams.append('roles', roles.join(','));
        if (activeOnly != null) queryParams.append('active_only', String(activeOnly));
        return this.get(`/operator/staff${queryParams.toString() ? '?' + queryParams.toString() : ''}`);
    }

    // Получить информацию о заказе по QR коду (курьер)
    async getQRCodeInfo(qrData) {
        return this.get(`/courier/qr/${encodeURIComponent(qrData)}`);
    }

    // ==================== Яндекс OAuth ====================
    
    // Авторизация через Яндекс
    async yandexAuth(code, state = null) {
        return this.post('/auth/yandex', { code, state });
    }

    // Завершение регистрации через Яндекс
    async yandexCompleteRegistration(regData) {
        return this.post('/auth/yandex/complete-registration', regData);
    }

    // Привязать дополнительную почту
    async linkAdditionalEmail(email) {
        return this.put('/profile/link-email', { additional_email: email });
    }

    // Привязать Яндекс ID к текущему аккаунту
    async linkYandexAccount(code) {
        return this.post('/profile/link-yandex', { code });
    }

    // Отвязать Яндекс ID от аккаунта
    async unlinkYandexAccount() {
        return this.delete('/profile/unlink-yandex');
    }

    // Проверить подписку на VK и получить бонус
    async checkVkSubscription() {
        return this.post('/profile/check-vk-subscription');
    }

    // Проверить подписку на Telegram и получить бонус
    async checkTelegramSubscription() {
        return this.post('/profile/check-telegram-subscription');
    }

    // Удалить аккаунт
    async deleteAccount(password, confirmText, yandexCode = null) {
        const data = { password, confirm_text: confirmText };
        if (yandexCode) {
            data.yandex_code = yandexCode;
        }
        return this.delete('/profile/delete-account', data);
    }

    // Отзыв согласия на обработку персональных данных (закрытие аккаунта с сохранением по закону)
    async withdrawConsent(password, confirmText, yandexCode = null) {
        const data = { password, confirm_text: confirmText };
        if (yandexCode) {
            data.yandex_code = yandexCode;
        }
        return this.post('/profile/withdraw-consent', data);
    }

    // ==================== Операторские методы для транзакций ====================
    
    // Получить все транзакции (оператор)
    async getOperatorTransactions(params = {}) {
        const queryParams = new URLSearchParams();
        if (params.type) queryParams.append('type', params.type);
        if (params.status) queryParams.append('status', params.status);
        if (params.search) queryParams.append('search', params.search);
        if (params.date_from) queryParams.append('date_from', params.date_from);
        if (params.date_to) queryParams.append('date_to', params.date_to);
        if (params.skip) queryParams.append('skip', params.skip);
        if (params.limit) queryParams.append('limit', params.limit);
        
        const url = `/operator/transactions${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        return this.get(url);
    }

    getOperatorTransactionsExportUrl(params = {}) {
        const queryParams = new URLSearchParams();
        if (params.type) queryParams.append('type', params.type);
        if (params.status) queryParams.append('status', params.status);
        if (params.date_from) queryParams.append('date_from', params.date_from);
        if (params.date_to) queryParams.append('date_to', params.date_to);
        return `${this.baseURL}/operator/transactions/export${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    }

    // ==================== Операторские методы для отзывов ====================
    
    // Получить все отзывы (оператор)
    async getOperatorReviews(statusFilter = null, platform = null) {
        const queryParams = new URLSearchParams();
        if (statusFilter) queryParams.append('status_filter', statusFilter);
        if (platform) queryParams.append('platform', platform);
        
        const url = `/operator/reviews${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        return this.get(url);
    }

    // Одобрить отзыв (оператор)
    async verifyReview(reviewId) {
        return this.post(`/operator/reviews/${reviewId}/verify`, {});
    }

    // Отклонить отзыв (оператор)
    async rejectReview(reviewId) {
        return this.post(`/operator/reviews/${reviewId}/reject`, {});
    }

    // ==================== Операторские методы для курьеров ====================
    
    // Получить всех курьеров (оператор)
    async getOperatorCouriers() {
        return this.get('/operator/couriers');
    }

    async getOperatorStatistics() {
        return this.get('/operator/statistics');
    }

    async getOperatorDetailedStatistics(metric, period = '7d', extra = {}) {
        const params = new URLSearchParams({ metric, period });
        if (extra.dateFrom) params.set('date_from', extra.dateFrom);
        if (extra.dateTo) params.set('date_to', extra.dateTo);
        return this.get(`/operator/statistics/detailed?${params.toString()}`);
    }

    async getOperatorMaterials() {
        return this.get('/operator/materials');
    }

    async createOperatorMaterial(materialData) {
        return this.post('/operator/materials', materialData);
    }

    async updateOperatorMaterial(materialId, materialData) {
        return this.put(`/operator/materials/${materialId}`, materialData);
    }

    async deleteOperatorMaterial(materialId) {
        return this.delete(`/operator/materials/${materialId}`);
    }

    async sendOperatorEmail(payload) {
        return this.post('/operator/send-email', payload);
    }

    async sendBroadcastEmail(payload) {
        return this.post('/operator/broadcast/email', payload);
    }

    async getBroadcastPreview(segment = 'all', channel = 'email') {
        return this.get(`/operator/broadcast/preview?segment=${encodeURIComponent(segment)}&channel=${encodeURIComponent(channel)}`);
    }

    async getBroadcastHistory(limit = 40) {
        return this.get(`/operator/broadcast/history?limit=${encodeURIComponent(limit)}`);
    }

    async getOperatorUserReferrals(userId) {
        return this.get(`/operator/users/${userId}/referrals`);
    }

    async sendBroadcastNotification(payload) {
        return this.post('/operator/broadcast/notifications', payload);
    }

    async sendNotificationToOne(payload) {
        return this.post('/operator/notifications/send-one', payload);
    }

    async notifyOperatorOrderClient(orderId, payload) {
        return this.post(`/operator/orders/${orderId}/notify-client`, payload);
    }

    async setOperatorOrderParent(orderId, parentOrderId) {
        return this.put(`/operator/orders/${orderId}/parent`, {
            parent_order_id: parentOrderId == null || parentOrderId === '' ? null : Number(parentOrderId),
        });
    }

    async getOperatorAudit(params = {}) {
        const queryParams = new URLSearchParams();
        if (params.limit) queryParams.append('limit', String(params.limit));
        if (params.action) queryParams.append('action', params.action);
        if (params.entityType) queryParams.append('entity_type', params.entityType);
        if (params.actorId != null) queryParams.append('actor_id', String(params.actorId));
        if (params.createdFrom) queryParams.append('created_from', params.createdFrom);
        if (params.createdTo) queryParams.append('created_to', params.createdTo);
        return this.get(`/operator/audit${queryParams.toString() ? '?' + queryParams.toString() : ''}`);
    }

    async getCourierOrders() {
        return this.get('/courier/orders');
    }

    async getCourierBalance() {
        return this.get('/courier/balance');
    }

    // ==================== Операторские методы для детальной информации о пользователе ====================
    
    // Получить файлы пользователя (оператор)
    async getOperatorUserFiles(userId) {
        return this.get(`/operator/users/${userId}/files`);
    }

    // Получить достижения пользователя (оператор)
    async getOperatorUserAchievements(userId) {
        return this.get(`/operator/users/${userId}/achievements`);
    }

    // Получить историю входов пользователя (оператор)
    async getOperatorUserLoginHistory(userId, skip = 0, limit = 50) {
        return this.get(`/operator/users/${userId}/login-history?skip=${skip}&limit=${limit}`);
    }

    // Получить транзакции пользователя (оператор)
    async getOperatorUserTransactions(userId, skip = 0, limit = 100) {
        return this.get(`/operator/users/${userId}/transactions?skip=${skip}&limit=${limit}`);
    }

    // Получить заказы пользователя (оператор)
    async getOperatorUserOrders(userId, skip = 0, limit = 100) {
        return this.get(`/operator/users/${userId}/orders?skip=${skip}&limit=${limit}`);
    }

    // Получить информацию о лояльности пользователя (оператор)
    async getOperatorUserLoyalty(userId) {
        return this.get(`/operator/users/${userId}/loyalty`);
    }

    async getOperatorFinanceReconcile() {
        return this.get('/operator/finance/reconcile');
    }

    async getOperatorHealth() {
        return this.get('/operator/health');
    }

    async getOperatorReportsOperators(days = 30) {
        return this.get(`/operator/reports/operators?days=${encodeURIComponent(days)}`);
    }

    async getOperatorReportsDeliveries(days = 30) {
        return this.get(`/operator/reports/deliveries?days=${encodeURIComponent(days)}`);
    }

    async getOperatorReportsMaterialsUsage(days = 30) {
        return this.get(`/operator/reports/materials-usage?days=${encodeURIComponent(days)}`);
    }

    async getOperatorReportsPrintersLoad(days = 7) {
        return this.get(`/operator/reports/printers-load?days=${encodeURIComponent(days)}`);
    }

    async getOperatorReportsCohortRetention(months = 6) {
        return this.get(`/operator/reports/cohort-retention?months=${encodeURIComponent(months)}`);
    }

    async getOperatorReportsLtvTop(limit = 20) {
        return this.get(`/operator/reports/ltv-top?limit=${encodeURIComponent(limit)}`);
    }

    async impersonateOperatorUser(userId) {
        return this.post(`/operator/users/${userId}/impersonate`, {});
    }

    async getOperatorWeeklyReportPreview() {
        return this.get('/operator/reports/weekly-email/preview');
    }

    async sendOperatorWeeklyReport() {
        return this.post('/operator/reports/weekly-email/send', {});
    }

    async getOperatorSecuritySettings() {
        return this.get('/operator/settings/security');
    }

    async updateOperatorSecuritySettings(payload) {
        return this.put('/operator/settings/security', payload);
    }

    async getOperatorSmsStatus() {
        return this.get('/operator/comms/sms/status');
    }

    async sendOperatorSms(phone, message) {
        return this.post('/operator/comms/sms/send', { phone, message });
    }

    async getLoyaltyCampaigns() {
        return this.get('/operator/loyalty/campaigns');
    }

    async updateLoyaltyCampaigns(campaigns) {
        return this.put('/operator/loyalty/campaigns', { campaigns });
    }

    async getOperatorTracking(trackingNumber, deliveryMethod = null) {
        const q = deliveryMethod ? `?delivery_method=${encodeURIComponent(deliveryMethod)}` : '';
        return this.get(`/operator/tracking/${encodeURIComponent(trackingNumber)}${q}`);
    }

    async getOperatorFinanceDepositsChart(days = 14) {
        return this.get(`/operator/finance/deposits-chart?days=${encodeURIComponent(days)}`);
    }

    async getOperatorCatalogModelsJson() {
        return this.get('/operator/catalog/models-json');
    }

    async updateOperatorCatalogModelsJson(data) {
        return this.put('/operator/catalog/models-json', { data });
    }

    async clearOperatorCatalogCache() {
        return this.post('/operator/catalog/cache/clear', {});
    }

    async patchOrderSlicerMeta(orderId, payload) {
        return this.patch(`/operator/orders/${orderId}/slicer-meta`, payload);
    }

    async regenerateOperatorOrderQr(orderId) {
        return this.post(`/operator/orders/${orderId}/qr/regenerate`, {});
    }

    getOperatorUserFileDownloadUrl(userId, fileId) {
        return `/api/operator/users/${userId}/files/${fileId}/download`;
    }

    async downloadOperatorUserFile(userId, fileId, filename) {
        const url = this.getOperatorUserFileDownloadUrl(userId, fileId);
        const headers = {};
        const token = this.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(url, { headers, credentials: 'same-origin' });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename || 'file';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
    }

    async deleteOperatorUserFile(userId, fileId) {
        return this.delete(`/operator/users/${userId}/files/${fileId}`);
    }

    async adjustOperatorUserLoyalty(userId, pointsDelta, reason) {
        return this.post(`/operator/users/${userId}/loyalty/adjust`, {
            points_delta: pointsDelta,
            reason: reason || 'operator_adjustment',
        });
    }

    // ==================== Операторские методы для расширенного управления заказами ====================
    
    // Получить историю заказа (оператор)
    async getOrderHistory(orderId) {
        return this.get(`/operator/orders/${orderId}/history`);
    }

    // Обновить теги заказа (оператор)
    async updateOrderTags(orderId, tags) {
        return this.put(`/operator/orders/${orderId}/tags`, { tags: tags });
    }

    // Обновить заметки заказа (оператор)
    async updateOrderNotes(orderId, notes) {
        return this.put(`/operator/orders/${orderId}/notes`, { operator_notes: notes });
    }

    // Обновить приоритет заказа (оператор)
    async updateOrderPriority(orderId, priority) {
        return this.put(`/operator/orders/${orderId}/priority`, { priority: priority });
    }

    async getOperatorSlaSettings() {
        return this.get('/operator/settings/sla');
    }

    async updateOperatorSlaSettings(thresholds) {
        return this.put('/operator/settings/sla', { thresholds });
    }

    async updateOrderChecklist(orderId, checklist) {
        return this.put(`/operator/orders/${orderId}/checklist`, { checklist });
    }

    async recalculateOrderSlicer(orderId) {
        return this.post(`/operator/orders/${orderId}/recalculate-slicer`, {});
    }

    async getOperatorPrinters() {
        return this.get('/operator/printers');
    }

    async createOperatorPrinter(payload) {
        return this.post('/operator/printers', payload);
    }

    async assignPrinterToOrder(orderId, printerId) {
        return this.put(`/operator/orders/${orderId}/assign-printer`, { printer_id: printerId });
    }

    async getOperatorPrintersCalendar(days = 7) {
        return this.get(`/operator/printers/calendar?days=${encodeURIComponent(String(days))}`);
    }

    async getOperatorOrderQcPhotos(orderId) {
        return this.get(`/operator/orders/${orderId}/qc-photos`);
    }

    async uploadOperatorOrderQcPhoto(orderId, photoFile, caption) {
        const formData = new FormData();
        formData.append('photo', photoFile);
        if (caption) formData.append('caption', caption);
        return this.post(`/operator/orders/${orderId}/qc-photos`, formData);
    }

    async deleteOperatorOrderQcPhoto(orderId, photoId) {
        return this.delete(`/operator/orders/${orderId}/qc-photos/${photoId}`);
    }

    async getProductionShiftPlan() {
        return this.get('/operator/production/shift-plan');
    }

    async updateProductionShiftPlan(payload) {
        return this.put('/operator/production/shift-plan', payload);
    }

    async getPrintersMaintenance(params = {}) {
        const q = new URLSearchParams();
        if (params.printerId) q.append('printer_id', String(params.printerId));
        if (params.limit) q.append('limit', String(params.limit));
        const qs = q.toString();
        return this.get(`/operator/printers/maintenance${qs ? `?${qs}` : ''}`);
    }

    async addPrinterMaintenance(printerId, payload) {
        return this.post(`/operator/printers/${printerId}/maintenance`, payload);
    }

    async getOctoprintStatus() {
        return this.get('/operator/octoprint/status');
    }

    async getPromoCampaigns() {
        return this.get('/operator/promo/campaigns');
    }

    async updatePromoCampaigns(campaigns) {
        return this.put('/operator/promo/campaigns', { campaigns });
    }
}

// Создаем глобальный экземпляр API клиента (window.api — для operator-api, profile и др.)
const api = new ApiClient();
if (typeof window !== 'undefined') {
    window.api = api;
}

