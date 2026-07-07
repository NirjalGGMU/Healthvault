import { ReactNode } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';

import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './pages/Login';
import MFASetup from './pages/MFASetup';
import MFAVerify from './pages/MFAVerify';
import MagicLink from './pages/MagicLink';
import MagicLinkVerify from './pages/MagicLinkVerify';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

import PatientDashboard from './pages/patient/PatientDashboard';
import BookAppointment from './pages/patient/BookAppointment';
import MyAppointments from './pages/patient/MyAppointments';

import DoctorDashboard from './pages/doctor/DoctorDashboard';
import DoctorAppointments from './pages/doctor/DoctorAppointments';

import AdminDashboard from './pages/admin/AdminDashboard';
import ManageUsers from './pages/admin/ManageUsers';
import AllAppointments from './pages/admin/AllAppointments';

/** Gives public (unauthenticated) pages the same #main-content skip-link target as AppLayout */
const Public = ({ children }: { children: ReactNode }) => (
  <main id="main-content" tabIndex={-1} className="focus:outline-none">
    {children}
  </main>
);

/** Shared shell for all authenticated pages: Navbar on top, Sidebar on the left */
const AppLayout = () => (
  <div className="flex min-h-[calc(100vh-4rem)]">
    <Sidebar />
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-8 sm:px-6 lg:px-8 focus:outline-none">
      <div className="mx-auto max-w-6xl">
        <Outlet />
      </div>
    </main>
  </div>
);

const App = () => (
  <div className="min-h-screen">
    <a href="#main-content" className="skip-link">
      Skip to main content
    </a>
    <Navbar />
    <Routes>
      {/* Public */}
      <Route path="/" element={<Public><Landing /></Public>} />
      <Route path="/register" element={<Public><Register /></Public>} />
      <Route path="/login" element={<Public><Login /></Public>} />
      <Route path="/mfa-verify" element={<Public><MFAVerify /></Public>} />
      <Route path="/magic-link" element={<Public><MagicLink /></Public>} />
      <Route path="/magic-link/verify" element={<Public><MagicLinkVerify /></Public>} />

      {/* Authenticated */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/mfa-setup" element={<MFASetup />} />

          {/* Patient only */}
          <Route element={<RoleRoute allowed={['patient']} />}>
            <Route path="/patient" element={<PatientDashboard />} />
            <Route path="/patient/book" element={<BookAppointment />} />
            <Route path="/patient/appointments" element={<MyAppointments />} />
          </Route>

          {/* Doctor only */}
          <Route element={<RoleRoute allowed={['doctor']} />}>
            <Route path="/doctor" element={<DoctorDashboard />} />
            <Route path="/doctor/appointments" element={<DoctorAppointments />} />
          </Route>

          {/* Admin only */}
          <Route element={<RoleRoute allowed={['admin']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<ManageUsers />} />
            <Route path="/admin/appointments" element={<AllAppointments />} />
          </Route>
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<Public><NotFound /></Public>} />
    </Routes>
  </div>
);

export default App;
