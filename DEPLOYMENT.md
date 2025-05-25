# Walkie-Talkie App Deployment Guide

## Frontend Deployment (Vercel)

1. Create a Vercel account at https://vercel.com
2. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. Navigate to the frontend directory:
   ```bash
   cd walkie-talkie
   ```
4. Deploy to Vercel:
   ```bash
   vercel
   ```
5. When prompted, set the environment variable:
   - `NEXT_PUBLIC_BACKEND_URL`: Your backend URL (we'll get this after backend deployment)

## Backend Deployment (Render)

1. Create a Render account at https://render.com
2. Create a new Web Service
3. Connect your GitHub repository
4. Configure the service:
   - Name: walkie-talkie-backend
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Add environment variables:
     - `NODE_ENV`: production
     - `PORT`: 3001

5. Deploy the service
6. Once deployed, copy the backend URL (e.g., https://walkie-talkie-backend.onrender.com)
7. Update the frontend environment variable in Vercel:
   - Go to your Vercel project settings
   - Add environment variable:
     - `NEXT_PUBLIC_BACKEND_URL`: Your Render backend URL

## Testing the Deployment

1. Visit your Vercel frontend URL
2. Open the app in two different browsers or devices
3. Enter the same room name in both
4. Test the walkie-talkie functionality

## Important Notes

- The backend is deployed on Render's free tier, which may have some limitations
- The app will work best when users are on modern browsers with WebRTC support
- Make sure to allow microphone access when prompted 