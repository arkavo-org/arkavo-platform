import React, { useState } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import Navbar from './Navbar';
import Feed from './Feed';
import VideoFeed from './VideoFeed';
import Privacy from './Privacy';
import ExploreRooms from './chat/ExploreRooms';
import CreateRoom from './chat/CreateRoom';
import CreateOrg from './CreateOrg';
import OrgManagement from './OrgManagement';
import Profile from './Profile';
import Room from './chat/Room';
import YourChats from './chat/YourChats';
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

const RoomRoute: React.FC = () => {
    const { roomId } = useParams();
    return <Room roomId={roomId || ''} />;
};

const AppRoutes: React.FC<AppRoutesProps> = () => {
    const [showProfileModal, setShowProfileModal] = useState(false);
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <Promo />;
    }

    if (!isAuthenticated) {
        return <Promo />;
    }

    return (
        <div id="fullpage">
            <Navbar onProfileClick={() => setShowProfileModal(true)} />
            <div className="app-content">
                <Routes>
                    <Route path="/" element={<YourChats />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/chat" element={<YourChats />} />
                    <Route path="/chat/:roomId" element={<RoomRoute />} />
                    <Route path="/create-room" element={<CreateRoom />} />
                    <Route path="/create-org" element={<CreateOrg />} />
                    <Route path="/org/:orgId" element={<OrgManagement />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/feed" element={<Feed />} />
                    <Route path="/navbar" element={<Navbar onProfileClick={() => setShowProfileModal(true)} />} />
                    <Route path="/room/:roomId" element={<RoomRoute />} />
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
