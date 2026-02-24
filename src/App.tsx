/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  ShieldQuestion, 
  Send, 
  History, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Trash2,
  ExternalLink,
  Languages
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AnalysisResult {
  riskScore: number;
  riskLevel: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  explanation: string;
  detectedLanguage: string;
  riskyKeywords: string[];
}

interface HistoryItem {
  id: number;
  message: string;
  risk_score: number;
  risk_level: string;
  explanation: string;
  language: string;
  created_at: string;
}

export default function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error('Failed to fetch history');
    }
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      setValidationError('Please enter a message to analyze.');
      return;
    }
    
    if (trimmedInput.length < 10) {
      setValidationError('Message is too short. Please provide at least 10 characters for a better analysis.');
      return;
    }

    if (trimmedInput.length > 2000) {
      setValidationError('Message is too long. Please limit it to 2000 characters.');
      return;
    }

    if (loading) return;

    setLoading(true);
    setValidationError(null);
    setResult(null);

    try {
      // Check if we need to select a key (for some environments/models)
      const aistudio = (window as any).aistudio;
      if (aistudio && !(await aistudio.hasSelectedApiKey())) {
        await aistudio.openSelectKey();
      }

      const apiKey = process.env.GEMINI_API_KEY;
      
      const ai = new GoogleGenAI({ apiKey: apiKey || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following SMS/WhatsApp message for potential scams or fraud. 
        The message might be in English or an Indian regional language (Hindi, Tamil, Telugu, Malayalam, etc.).
        
        Message: "${trimmedInput}"
        
        Rules for Scoring:
        - Suspicious links: +30
        - Asking for OTP: +40
        - Urgent/Threatening tone: +20
        - Unknown/Suspicious sender context: +10
        - Financial requests (money, bank details): +30
        Max score is 100.
        
        Provide the analysis in JSON format with:
        - riskScore (0-100)
        - riskLevel (SAFE, SUSPICIOUS, HIGH RISK)
        - explanation (Human readable points)
        - detectedLanguage
        - riskyKeywords (Array of words found in the message that are suspicious)
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              riskScore: { type: Type.INTEGER },
              riskLevel: { type: Type.STRING },
              explanation: { type: Type.STRING },
              detectedLanguage: { type: Type.STRING },
              riskyKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["riskScore", "riskLevel", "explanation", "detectedLanguage", "riskyKeywords"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      
      // Normalize data
      const normalizedData: AnalysisResult = {
        riskScore: data.riskScore ?? 0,
        riskLevel: data.riskLevel ?? 'UNKNOWN',
        explanation: data.explanation ?? 'No explanation provided.',
        detectedLanguage: data.detectedLanguage ?? 'Unknown',
        riskyKeywords: Array.isArray(data.riskyKeywords) ? data.riskyKeywords : []
      };

      setResult(normalizedData);

      // Save to history via backend
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: trimmedInput,
          ...normalizedData
        }),
      });

      fetchHistory();
      setInput('');
    } catch (err: any) {
      setValidationError(err.message || 'Analysis failed. Please try again.');
      console.error('Analysis failed', err);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'HIGH RISK': return 'text-red-500 bg-red-50 border-red-200';
      case 'SUSPICIOUS': return 'text-amber-500 bg-amber-50 border-amber-200';
      case 'SAFE': return 'text-emerald-500 bg-emerald-50 border-emerald-200';
      default: return 'text-slate-500 bg-slate-50 border-slate-200';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'HIGH RISK': return <ShieldAlert className="w-6 h-6" />;
      case 'SUSPICIOUS': return <ShieldQuestion className="w-6 h-6" />;
      case 'SAFE': return <ShieldCheck className="w-6 h-6" />;
      default: return <Info className="w-6 h-6" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans text-slate-900">
      {/* Header */}
      <header className="bg-[#00A884] text-white py-4 px-6 shadow-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-full">
              <ShieldAlert className="text-[#00A884] w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SafeText AI</h1>
              <p className="text-xs opacity-90">SMS & WhatsApp Scam Detector</p>
            </div>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <History className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-6 pb-32">
        <AnimatePresence mode="wait">
          {showHistory ? (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Recent Scans</h2>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="text-[#00A884] font-semibold hover:underline"
                >
                  Back to Scanner
                </button>
              </div>
              {history.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
                  <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 italic">No scan history yet.</p>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-[#00A884]/30 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold border",
                        getRiskColor(item.risk_level)
                      )}>
                        {item.risk_level}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-slate-700 text-sm line-clamp-2 mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                      "{item.message}"
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Score: {typeof item.risk_score === 'number' ? item.risk_score : 0}%
                      </span>
                      <span className="flex items-center gap-1">
                        <Languages className="w-3 h-3" /> {item.language || 'Unknown'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          ) : (
            <div className="space-y-6">
              {/* Hero Section */}
              <div className="text-center py-8">
                <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Is that message a scam?</h2>
                <p className="text-slate-500 max-w-md mx-auto">
                  Paste any suspicious SMS or WhatsApp message below. Our AI detects fraud in English, Hindi, Tamil, and more.
                </p>
              </div>

              {/* Result Area */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "rounded-3xl p-6 border-2 shadow-lg mb-8",
                      result.riskLevel === 'HIGH RISK' ? "bg-red-50 border-red-200" :
                      result.riskLevel === 'SUSPICIOUS' ? "bg-amber-50 border-amber-200" :
                      "bg-emerald-50 border-emerald-200"
                    )}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div className={cn(
                        "p-4 rounded-2xl",
                        result.riskLevel === 'HIGH RISK' ? "bg-red-500 text-white" :
                        result.riskLevel === 'SUSPICIOUS' ? "bg-amber-500 text-white" :
                        "bg-emerald-500 text-white"
                      )}>
                        {getRiskIcon(result.riskLevel)}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold">{result.riskLevel || 'UNKNOWN'}</h3>
                        <p className="text-sm opacity-80">Risk Score: {typeof result.riskScore === 'number' ? result.riskScore : 0}%</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                          <Info className="w-4 h-4" /> Why is this risky?
                        </h4>
                        <div className="prose prose-sm text-slate-700 markdown-body">
                          <Markdown>{result?.explanation || ''}</Markdown>
                        </div>
                      </div>

                      {result?.riskyKeywords && result.riskyKeywords.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Flagged Keywords</h4>
                          <div className="flex flex-wrap gap-2">
                            {result.riskyKeywords.map((word, i) => (
                              <span key={i} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-red-600 shadow-sm">
                                {word}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between pt-4 border-t border-slate-200/50">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Languages className="w-3 h-3" /> Detected: {result?.detectedLanguage || 'Unknown'}
                        </span>
                        <button 
                          onClick={() => window.open('https://cybercrime.gov.in/', '_blank')}
                          className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1"
                        >
                          Report to Authorities <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input Area */}
              <div className="bg-white rounded-3xl shadow-xl p-2 border border-slate-200">
                <form onSubmit={handleAnalyze} className="flex flex-col">
                  <textarea
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="Paste message here (e.g., 'Your bank account is blocked. Click here...')"
                    className={cn(
                      "w-full p-6 min-h-[150px] resize-none focus:outline-none text-slate-700 placeholder:text-slate-300 text-lg leading-relaxed",
                      validationError && "bg-red-50/30"
                    )}
                  />
                  {validationError && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="px-6 py-2 text-red-500 text-xs font-bold flex items-center gap-2 bg-red-50/50"
                    >
                      <AlertTriangle className="w-3 h-3" /> {validationError}
                    </motion.div>
                  )}
                  <div className="flex justify-between items-center p-4 border-t border-slate-100">
                    <div className="flex gap-2">
                      <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        AI Analysis
                      </span>
                      <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Multilingual
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className={cn(
                        "flex items-center gap-2 px-8 py-3 rounded-2xl font-bold transition-all shadow-lg",
                        loading || !input.trim() 
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
                          : "bg-[#00A884] text-white hover:bg-[#008F70] active:scale-95"
                      )}
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          Analyze <Send className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Quick Tips */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold mb-2">Safe Messages</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">Personal chats from known contacts without urgent financial requests or links.</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mb-4">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold mb-2">Suspicious</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">Messages from unknown numbers asking for help or containing shortened links.</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mb-4">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold mb-2">High Risk</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">Requests for OTP, bank details, or threats of account blocking. Never share info!</p>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 py-4 px-6 z-40">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span>© 2026 SafeText AI</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-[#00A884]">Privacy</a>
            <a href="#" className="hover:text-[#00A884]">Terms</a>
            <a href="#" className="hover:text-[#00A884]">Help</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
