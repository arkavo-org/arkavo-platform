import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './Navbar';
import Feed from './Feed';
import VideoFeed from './VideoFeed';
import Privacy from './Privacy';
import ExploreRooms from './chat/ExploreRooms';
import CreateRoom from './chat/CreateRoom';
import Profile from './Profile';
import Room from './chat/Room';
import ChatPage from './chat/ChatPage';
import APIChat from './APIChat';
import Events from './Events';
import TDF from './TDF';
import Ballot from './Ballot';
import './css/App.css';
import './css/Promo.css';
import Bluesky from './Bluesky';
import Promo from './Promo';
import { useAuth } from './context/AuthContext';

interface AppRoutesProps {}

const AppRoutes: React.FC<AppRoutesProps> = () => {
    const [showProfileModal, setShowProfileModal] = useState(false);
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="promo-shell">
                <div className="promo-hero">
                    <div className="promo-hero-text">
                        <span className="promo-kicker">Arkavo Secure Messaging</span>
                        <h1>Establishing secure session</h1>
                        <p>Validating credentials and policy for mission access.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Promo />;
    }

    return (
        <div id="fullpage">
            <Navbar onProfileClick={() => setShowProfileModal(true)} />
            <div className="app-content">
                <Routes>
                    <Route path="/" element={<ChatPage />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/chat" element={<ChatPage />} />
                    <Route path="/chat/:roomId" element={<ChatPage />} />
                    <Route path="/create-room" element={<CreateRoom />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/feed" element={<Feed />} />
                    <Route path="/navbar" element={<Navbar onProfileClick={() => setShowProfileModal(true)} />} />
                    <Route 
                      path="/room/:roomId" 
                      element={<Room roomId="" />}
                    />
                    <Route path="/video" element={<VideoFeed />} />
                    <Route 
                      path="/explore" 
                      element={<ExploreRooms onRoomSelect={() => {}} />} 
                    />
                    <Route path="/tdf" element={<TDF />} />
                    <Route path="/apichat" element={<APIChat />} />
                    <Route path="/ballot" element={<Ballot />} />
                </Routes>
            </div>

            {/* Profile Modal */}
            {showProfileModal && (
                <Profile 
                    isModal={true} 
                    onClose={() => setShowProfileModal(false)} 
                />
            )}
        </div>
    );
};

export default AppRoutes;
