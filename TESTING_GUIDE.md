# Bridge AI OS Superuser Setup - Testing Guide

## ✅ COMPLETED SETUP

### Backend Changes Made:
1. **Superuser Configuration**: Added SUPERUSERS list with all 3 emails
2. **New API Endpoints**:
   - `GET /api/admin/check-access?user_email=<email>` - Verify superuser access
   - `GET /api/admin/superusers` - List all superusers
   - `POST /api/admin/notify-superuser` - Send notifications

### Frontend Changes Made:
1. **URL Routing Fixed**: Superusers now redirect to `/admin.html` instead of `/admin/dashboard`
2. **Admin Auth Guard**: Created `/public/src/admin-auth.js` with dual verification (client + server)
3. **Updated admin.html**: Now uses the new auth guard

### Email Templates Created:
- `SUPERUSER_ACCESS_EMAIL_TEMPLATE.md` - Complete documentation to send to superusers

## 🧪 TESTING INSTRUCTIONS

### Phase 1: Test Backend API Endpoints

**Start your backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Test superuser verification:**
```bash
# Test superuser access
curl "http://localhost:8000/api/admin/check-access?user_email=ryanpcowan@gmail.com"
# Should return: {"email":"ryanpcowan@gmail.com","is_superuser":true,"access_level":"superadmin",...}

# Test non-superuser
curl "http://localhost:8000/api/admin/check-access?user_email=test@example.com"
# Should return: {"email":"test@example.com","is_superuser":false,"access_level":"member",...}

# List all superusers
curl "http://localhost:8000/api/admin/superusers"
# Should return: {"superusers":["ryanpcowan@gmail.com","michaelgraemek@gmail.com","marvin.saunders@gmail.com"],"count":3}
```

### Phase 2: Test Frontend Authentication

**Start frontend server:**
```bash
cd frontend
npm install
npm run dev
# Or serve static files with nginx/python server
```

**Test login flow:**
1. Open `http://localhost:8082/onboarding.html`
2. Try logging in with `ryanpcowan@gmail.com`
3. Should redirect to `/admin.html`
4. Check browser console for auth logs
5. Verify admin dashboard loads

### Phase 3: Test Admin Dashboard Access

**Verify all admin pages load:**
- Visit `http://localhost:8082/admin.html` (should load)
- Visit `http://localhost:8082/admin-command.html` (should load)
- Visit `http://localhost:8082/dashboard.html` (should load)
- Visit `http://localhost:8082/intelligence.html` (should load)

### Phase 4: Test Production Deployment

**Deploy to production:**
```bash
# Build and deploy backend
docker-compose up --build -d backend

# Build and deploy frontend
docker-compose up --build -d frontend

# Check health
curl https://go.ai-os.co.za/health
```

**Test live superuser access:**
1. Visit `https://go.ai-os.co.za/onboarding`
2. Sign in with any superuser email
3. Verify redirect to admin panel
4. Test all admin dashboard links

## 📧 EMAIL SENDING INSTRUCTIONS

### Option 1: Manual Email Sending
Use the template in `SUPERUSER_ACCESS_EMAIL_TEMPLATE.md` and send to:
- ryanpcowan@gmail.com
- michaelgraemek@gmail.com
- marvin.saunders@gmail.com

### Option 2: Brevo/SendGrid Integration
Set up automated email sending:

```javascript
// Add to your email service
const superuserEmails = [
  'ryanpcowan@gmail.com',
  'michaelgraemek@gmail.com',
  'marvin.saunders@gmail.com'
];

// Send welcome emails with the template content
```

## 🔍 TROUBLESHOOTING

### Common Issues:

1. **502 Error on /admin/dashboard**: Fixed - now redirects to /admin.html
2. **Admin pages not loading**: Check admin-auth.js is included
3. **Backend API errors**: Verify FastAPI is running on port 8000
4. **CORS issues**: Check CORS middleware in backend

### Debug Commands:
```bash
# Check backend logs
docker-compose logs backend

# Test API directly
curl -H "Content-Type: application/json" https://go.ai-os.co.za/api/admin/superusers

# Check nginx config (if using nginx)
nginx -t
```

## ✅ SUCCESS CRITERIA

- [ ] All 3 superusers can log in and access admin panel
- [ ] All admin dashboard URLs load without errors
- [ ] Backend API endpoints return correct superuser status
- [ ] Authentication works in both development and production
- [ ] No 502 errors on admin routes

---

**Status**: Superuser system implemented and ready for testing 🚀</content>
<parameter name="filePath">SUPERUSER_SETUP_COMPLETE.md