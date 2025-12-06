
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { supabase } from './supabaseClient';
import { useLocation } from 'react-router-dom';

const ChatIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);

const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-90" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 h-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
    </svg>
);

interface Message {
    id: number | string;
    text: string;
    sender: 'user' | 'agent' | 'system' | 'ai';
    created_at?: string;
}

interface ChatSession {
    id: string;
    customer_email: string;
    status: 'open' | 'assigned' | 'closed';
    created_at: string;
    assigned_agent_id: string | null;
}

interface UserProfile {
    id: string;
    full_name: string;
    email: string;
    role: 'CEO' | 'Co-Founder' | 'Admin' | 'Employee';
}

const AI_INITIAL_GREETING = "Hello! I'm the PIXODE AI Assistant. How can I help you today?";
const SYSTEM_EMAIL_PROMPT = "Please enter your email below to connect with our support team.";

interface LiveSupportChatProps {
    isDashboardContext?: boolean;
}

const LiveSupportChat: React.FC<LiveSupportChatProps> = ({ isDashboardContext = false }) => {
    const [isOpen, setIsOpen] = useState(isDashboardContext);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [bufferedMessage, setBufferedMessage] = useState('');

    const [showEmailInput, setShowEmailInput] = useState(false);
    const [emailInputForChat, setEmailInputForChat] = useState('');

    const [currentChatId, setCurrentChatId] = useState<string | null>(null);
    const [customerEmail, setCustomerEmail] = useState<string | null>(null);
    const [chatStatus, setChatStatus] = useState<ChatSession['status']>('open');

    const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
    const [isAgent, setIsAgent] = useState(false);
    const [availableOpenChats, setAvailableOpenChats] = useState<ChatSession[]>([]);
    const [assignedChatSessions, setAssignedChatSessions] = useState<ChatSession[]>([]);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatSessionAI = useRef<any>(null);
    const aiInitialized = useRef(false);
    const supabaseRealtimeSubscription = useRef<any>(null);
    const supabaseAgentRealtimeSubscription = useRef<any>(null);
    const location = useLocation();
    
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages, showEmailInput, availableOpenChats, assignedChatSessions]);

    // 1. Check User Role (Agent vs Customer)
    useEffect(() => {
        const fetchUserProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                if (profile && !error) {
                    setCurrentUserProfile(profile as UserProfile);
                    // Determine if the user has agent privileges
                    const agentRoles = ['Employee', 'Admin', 'Co-Founder', 'CEO'];
                    const isAgentUser = agentRoles.includes(profile.role);
                    setIsAgent(isAgentUser);
                }
            } else {
                setCurrentUserProfile(null);
                setIsAgent(false);
            }
        };
        fetchUserProfile();

        const { data: authListener } = supabase.auth.onAuthStateChange(() => {
            fetchUserProfile();
        });

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, []);

    // 2. Initialize Chat Logic
    useEffect(() => {
        // If closed and not dashboard, clean up
        if (!isOpen && !isDashboardContext) {
            cleanupSubscriptions();
            return;
        }

        const initializeChatForCustomer = async () => {
             // Init AI
            if (!aiInitialized.current) {
                const geminiApiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;

                if (typeof geminiApiKey !== 'string' || geminiApiKey.trim() === '') {
                    // AI key missing
                } else {
                    try {
                        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
                        chatSessionAI.current = ai.chats.create({ 
                            model: 'gemini-2.5-flash',
                            config: {
                                systemInstruction: "You are a helpful support agent for PIXODE, a web and app development agency. You answer questions about services, pricing (custom quotes), and technologies (React, Node, etc). Keep answers concise."
                            }
                        });
                        aiInitialized.current = true;
                    } catch (e: any) {
                        console.error("AI Init Error:", e.message);
                    }
                }
            }

            // Restore session from localStorage
            const storedEmail = localStorage.getItem('pixode_customer_email');
            const storedChatId = localStorage.getItem('pixode_chat_id');

            setCustomerEmail(storedEmail);

            if (storedChatId && !isAgent) {
                // Verify if chat exists and is active
                const { data: chatData, error } = await supabase
                    .from('chats')
                    .select('*')
                    .eq('id', storedChatId)
                    .single();

                if (error || !chatData) {
                    // Invalid session
                    localStorage.removeItem('pixode_chat_id');
                    localStorage.removeItem('pixode_customer_email');
                    setCurrentChatId(null);
                    setCustomerEmail(null);
                    setMessages([{ id: 'init-ai', text: AI_INITIAL_GREETING, sender: 'ai' }]);
                    setMessages(prev => [...prev, { id: 'sys-prompt', text: SYSTEM_EMAIL_PROMPT, sender: 'system' }]);
                    setShowEmailInput(true);
                } else if (chatData.status === 'closed') {
                    // Closed session, start new
                    localStorage.removeItem('pixode_chat_id');
                    setCurrentChatId(null);
                    setMessages([{ id: 'init-ai', text: "Your previous session was closed. " + AI_INITIAL_GREETING, sender: 'ai' }]);
                    setMessages(prev => [...prev, { id: 'sys-prompt', text: SYSTEM_EMAIL_PROMPT, sender: 'system' }]);
                    setShowEmailInput(true);
                } else {
                    // Resume session
                    setCurrentChatId(chatData.id);
                    setChatStatus(chatData.status);
                    await loadMessages(chatData.id);
                    subscribeToChatChanges(chatData.id);
                }
            } else if (!storedChatId && !isAgent) {
                 // New session flow
                setMessages([{ id: 'init-ai', text: AI_INITIAL_GREETING, sender: 'ai' }]);
                setMessages(prev => [...prev, { id: 'sys-prompt', text: SYSTEM_EMAIL_PROMPT, sender: 'system' }]);
                setShowEmailInput(true);
            }
        };

        const initializeChatForAgent = async () => {
            if (!currentUserProfile || !isAgent) return;
            // Agent automatically gets dashboard view logic via props or explicit call
            subscribeToAgentChats(currentUserProfile.id);
            fetchAgentChatLists(currentUserProfile.id);
        };

        if (isAgent && isDashboardContext) {
            initializeChatForAgent();
        } else if (!isAgent && isOpen) {
            initializeChatForCustomer();
        }

        return () => {
             cleanupSubscriptions();
        };

    }, [isOpen, isAgent, currentUserProfile, isDashboardContext]);

    const cleanupSubscriptions = () => {
        if (supabaseRealtimeSubscription.current) {
            supabase.removeChannel(supabaseRealtimeSubscription.current);
            supabaseRealtimeSubscription.current = null;
        }
        if (supabaseAgentRealtimeSubscription.current) {
             supabase.removeChannel(supabaseAgentRealtimeSubscription.current);
             supabaseAgentRealtimeSubscription.current = null;
        }
    };

    const fetchAgentChatLists = async (agentId: string) => {
        // 1. Fetch Open Chats
        const { data: openChats } = await supabase
            .from('chats')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false });
        setAvailableOpenChats(openChats || []);

        // 2. Fetch Assigned Chats
        const { data: assignedChats } = await supabase
            .from('chats')
            .select('*')
            .eq('assigned_agent_id', agentId)
            .neq('status', 'closed') // Show assigned and open/active
            .order('updated_at', { ascending: false });
        setAssignedChatSessions(assignedChats || []);
    };

    const subscribeToAgentChats = (agentId: string) => {
        // Subscribe to changes in 'chats' table to update lists in realtime
        const subscription = supabase
            .channel('agent-chats-list')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
                 fetchAgentChatLists(agentId);
            })
            .subscribe();
        
        supabaseAgentRealtimeSubscription.current = subscription;
    };

    const loadMessages = async (chatId: string) => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true });
        
        if (data) {
            setMessages(data as Message[]);
        }
    };

    const subscribeToChatChanges = (chatId: string) => {
        if (supabaseRealtimeSubscription.current) {
            supabase.removeChannel(supabaseRealtimeSubscription.current);
        }

        const subscription = supabase
            .channel(`chat:${chatId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages', 
                filter: `chat_id=eq.${chatId}` 
            }, (payload) => {
                setMessages(prev => {
                    if (prev.find(m => m.id === payload.new.id)) return prev;
                    return [...prev, payload.new as Message];
                });
            })
            .subscribe();

        supabaseRealtimeSubscription.current = subscription;
    };

    const createChatSession = async (email: string) => {
        // Create new chat row
        const { data, error } = await supabase
            .from('chats')
            .insert([{ customer_email: email, status: 'open' }])
            .select()
            .single();

        if (error) {
            console.error("Error creating chat:", error.message);
            setMessages(prev => [...prev, { id: 'err', text: "Failed to start chat. Please try again.", sender: 'system' }]);
            return;
        }

        if (data) {
            setCurrentChatId(data.id);
            setCustomerEmail(email);
            setChatStatus('open');
            localStorage.setItem('pixode_chat_id', data.id);
            localStorage.setItem('pixode_customer_email', email);
            
            setShowEmailInput(false);
            
            // If there was a buffered message (user typed before email), send it now
            if (bufferedMessage) {
                 await sendMessage(bufferedMessage, data.id, 'user');
                 setBufferedMessage('');
            }

            subscribeToChatChanges(data.id);
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!emailInputForChat.trim() || !emailInputForChat.includes('@')) return;
        await createChatSession(emailInputForChat);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const text = inputValue;
        setInputValue('');

        if (isAgent) {
             // Agent sending message
             if (!currentChatId) return;
             await sendMessage(text, currentChatId, 'agent');
        } else {
             // Customer sending message
             if (!currentChatId) {
                 // Capture message, ask for email if not already there
                 if (showEmailInput) {
                     // We already showed input
                 } else {
                     setBufferedMessage(text);
                     setShowEmailInput(true);
                     setMessages(prev => [...prev, { id: 'sys-prompt', text: SYSTEM_EMAIL_PROMPT, sender: 'system' }]);
                 }
                 return;
             }
             await sendMessage(text, currentChatId, 'user');
        }
    };

    const sendMessage = async (text: string, chatId: string, sender: 'user' | 'agent' | 'system' | 'ai') => {
        const { error } = await supabase.from('messages').insert({
            chat_id: chatId,
            text,
            sender
        });

        if (error) {
            console.error("Send error:", error.message);
            return;
        }

        // AI Reply Logic (Only if customer sent message AND chat is open/unassigned)
        if (sender === 'user' && chatStatus === 'open' && aiInitialized.current && chatSessionAI.current) {
            setTimeout(async () => {
                try {
                    const result = await chatSessionAI.current.sendMessage(text);
                    const responseText = result.response.text;
                    
                    // Save AI response to DB
                    await supabase.from('messages').insert({
                        chat_id: chatId,
                        text: responseText,
                        sender: 'ai'
                    });
                } catch (err) {
                    console.error("AI Generation Error:", err);
                }
            }, 500);
        }
    };

    // Agent Actions
    const handleJoinChat = async (chatId: string) => {
        if (!currentUserProfile) return;

        const { error } = await supabase
            .from('chats')
            .update({ status: 'assigned', assigned_agent_id: currentUserProfile.id })
            .eq('id', chatId);
        
        if (!error) {
            setCurrentChatId(chatId);
            setChatStatus('assigned');
            await loadMessages(chatId);
            subscribeToChatChanges(chatId);
            
            // System message announcing agent
            await sendMessage(`${currentUserProfile.full_name} has joined the chat.`, chatId, 'system');
        }
    };

    const handleSelectChat = async (chat: ChatSession) => {
        setCurrentChatId(chat.id);
        setChatStatus(chat.status);
        await loadMessages(chat.id);
        subscribeToChatChanges(chat.id);
    };

    const handleCloseChat = async () => {
        if (!currentChatId) return;
        await supabase.from('chats').update({ status: 'closed' }).eq('id', currentChatId);
        setCurrentChatId(null);
        setMessages([]);
        if (isAgent && currentUserProfile) fetchAgentChatLists(currentUserProfile.id);
    };

    const renderMessage = (msg: Message) => {
        const isMe = isAgent ? msg.sender === 'agent' : msg.sender === 'user';
        const isSystem = msg.sender === 'system';
        const isAi = msg.sender === 'ai';
        
        if (isSystem) {
            return (
                <div key={msg.id} className="flex justify-center my-2">
                    <span className="text-xs text-gray-500 bg-gray-900/50 px-2 py-1 rounded">{msg.text}</span>
                </div>
            );
        }

        return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} my-2`}>
                 <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                     isMe ? 'bg-purple-600 text-white rounded-br-none' : 
                     isAi ? 'bg-indigo-900/80 text-gray-200 border border-indigo-500/30 rounded-bl-none' :
                     'bg-gray-700 text-white rounded-bl-none'
                 }`}>
                     {isAi && <div className="text-[10px] text-indigo-300 font-bold mb-1">AI Assistant</div>}
                     {(!isMe && !isAi) && msg.sender === 'agent' && <div className="text-[10px] text-purple-300 font-bold mb-1">Agent</div>}
                     {msg.text}
                 </div>
            </div>
        );
    };

    // --- RENDER: DASHBOARD (AGENT) VIEW ---
    if (isDashboardContext && isAgent) {
        return (
            <div className="flex h-full rounded-lg overflow-hidden bg-[#110e1a] border border-white/10">
                {/* Sidebar */}
                <div className="w-1/3 border-r border-white/10 bg-[#0a031a] flex flex-col">
                    <div className="p-4 bg-[#1a142e] font-bold text-white border-b border-white/10">Active Chats</div>
                    <div className="flex-1 overflow-y-auto">
                        {/* Open Chats */}
                        {availableOpenChats.length > 0 && (
                            <div className="mb-4">
                                <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Waiting for Agent</div>
                                {availableOpenChats.map(chat => (
                                    <div key={chat.id} className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5" onClick={() => handleJoinChat(chat.id)}>
                                        <div className="font-semibold text-white">{chat.customer_email}</div>
                                        <div className="text-xs text-green-400">Open - Click to Join</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* My Assigned Chats */}
                        <div>
                            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase">My Active Chats</div>
                            {assignedChatSessions.map(chat => (
                                <div 
                                    key={chat.id} 
                                    className={`px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 ${currentChatId === chat.id ? 'bg-purple-900/20' : ''}`} 
                                    onClick={() => handleSelectChat(chat)}
                                >
                                    <div className="font-semibold text-white">{chat.customer_email}</div>
                                    <div className="text-xs text-purple-400">In Progress</div>
                                </div>
                            ))}
                             {assignedChatSessions.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">No active chats assigned to you.</div>}
                        </div>
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className="w-2/3 flex flex-col bg-[#1a142e]">
                    {currentChatId ? (
                        <>
                            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#110e1a]">
                                <div>
                                    <div className="font-bold text-white">{assignedChatSessions.find(c => c.id === currentChatId)?.customer_email || 'Chat Session'}</div>
                                    <div className="text-xs text-gray-400">ID: {currentChatId}</div>
                                </div>
                                <button onClick={handleCloseChat} className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs text-white">Close Session</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {messages.map(renderMessage)}
                                <div ref={chatEndRef} />
                            </div>
                            <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-[#0a031a] flex gap-2">
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder="Type a reply..."
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                                />
                                <button type="submit" className="p-2 bg-purple-600 rounded-lg text-white hover:bg-purple-700"><SendIcon /></button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500 flex-col">
                            <ChatIcon />
                            <p className="mt-2">Select a chat to start messaging.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- RENDER: WIDGET (CUSTOMER) VIEW ---
    // Hide widget on dashboard or login
    if (location.pathname.startsWith('/dashboard') || location.pathname === '/login') return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="mb-4 w-80 sm:w-96 h-[500px] bg-[#1a142e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-700 to-indigo-700 p-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <h3 className="font-bold text-white">PIXODE Support</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white"><XIcon /></button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0a031a]">
                        {messages.map(renderMessage)}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Email Input Prompt */}
                    {showEmailInput && (
                        <div className="p-4 bg-[#110e1a] border-t border-white/5">
                            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
                                <input 
                                    type="email" 
                                    placeholder="Enter your email..." 
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                    value={emailInputForChat}
                                    onChange={(e) => setEmailInputForChat(e.target.value)}
                                    required
                                />
                                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 rounded-lg transition-colors">Start Chat</button>
                            </form>
                        </div>
                    )}

                    {/* Chat Input */}
                    {!showEmailInput && (
                        <form onSubmit={handleSendMessage} className="p-3 bg-[#110e1a] border-t border-white/10 flex gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Type a message..."
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                            />
                            <button type="submit" className="p-2 bg-purple-600 rounded-lg text-white hover:bg-purple-700"><SendIcon /></button>
                        </form>
                    )}
                </div>
            )}

            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className={`p-4 rounded-full shadow-lg transform transition-transform hover:scale-110 focus:outline-none ${isOpen ? 'bg-gray-700 text-white' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white animate-background-lights'}`}
            >
                {isOpen ? <XIcon /> : <ChatIcon />}
            </button>
        </div>
    );
};

export default LiveSupportChat;
