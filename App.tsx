import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import HomePage from './HomePage';
import AboutPage from './AboutPage';
import ProjectsPage from './PortfolioPage';
import ContactPage from './ContactPage';
import ScrollToTop from './ScrollToTop';
import PartnershipsPage from './PartnershipsPage';
import LiveSupportChat from './LiveSupportChat'; 
import DashboardPage from './DashboardPage';
import LoginPage from './LoginPage';
import ProjectDetailPage from './ProjectDetailPage';

const App: React.FC = () => {
  return (
    <HashRouter>
      <ScrollToTop />
      <div className="bg-[#0a031a] text-white min-h-screen">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="/partnerships" element={<PartnershipsPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </main>
        <Footer />
        <LiveSupportChat />
      </div>
    </HashRouter>
  );
};

export default App;
