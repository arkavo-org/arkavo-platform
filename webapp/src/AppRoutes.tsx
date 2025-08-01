// src/AppRoutes.tsx
import React from 'react';
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
import './css/App.css';
import Bluesky from './Bluesky';
 
interface AppRoutesProps {}

const AppRoutes: React.FC<AppRoutesProps> = () => {
    return (
        <div id="fullpage">
            <Navbar />
            <Routes>
                <Route path="/" element={<ChatPage />} /> {/* Home route for the feed */}
                <Route path="/privacy" element={<Privacy />} /> {/* Privacy page route */}
                <Route path="/profile" element={<Profile />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/create-room" element={<CreateRoom />} />
                <Route path="/events" element={<Events />} />
                <Route path="/feed" element={<Feed />} />
                <Route path="/navbar" element={<Navbar />} />
                <Route 
                  path="/room/:roomId" 
                  element={<Room roomId="" />} // roomId will be provided by router params
                />
                <Route path="/video" element={<VideoFeed />} />
                <Route 
                  path="/explore" 
                  element={<ExploreRooms onRoomSelect={() => {}} />} 
                />
                <Route path="/tdf" element={<TDF />} />
                <Route path="/apichat" element={<APIChat />} />
            </Routes>
        </div>
    );
};

export default AppRoutes;
