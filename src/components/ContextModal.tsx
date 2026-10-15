import React, { useState } from 'react';
import {
  X,
  Briefcase,
  Building,
  FileText,
  Upload,
  Sparkles,
  Search,
  Check,
  AlertCircle,
  Loader2,
  FileCheck,
  Globe,
  Linkedin,
  Paperclip,
} from 'lucide-react';
import { CandidateContext } from '../types/interview';

interface ContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: CandidateContext;
  onSaveContext: (updated: CandidateContext) => void;
}

export const ContextModal: React.FC<ContextModalProps> = ({
  isOpen,
  onClose,
  context,
  onSaveContext,
}) => {
  const [formData, setFormData] = useState<CandidateContext>({ ...context });
  const [isAnalyzingDoc, setIsAnalyzingDoc] = useState(false);
  const [isSearchingIntel, setIsSearchingIntel] = useState(false);
  const [docFeedback, setDocFeedback] = useState<string | null>(null);
  const [companyIntel, setCompanyIntel] = useState<string | null>(null);
  const [intelSources, setIntelSources] = useState<Array<{ title?: string; uri?: string }>>([]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileType: 'resume' | 'jd') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingDoc(true);
    setDocFeedback(`กำลังสแกนและวิเคราะห์ ${file.name} ด้วย Multimodal Gemini 4...`);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Content = (reader.result as string).split(',')[1];
        const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');

        const res = await fetch('/api/analyze-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64Content,
            mimeType,
            fileType,
          }),
        });

        const data = await res.json();
        if (data.analysis) {
          const formatted = JSON.stringify(data.analysis, null, 2);
          if (fileType === 'resume') {
            setFormData((prev) => ({
              ...prev,
              resume: `[สรุปประวัติ Resume จาก AI]:\n${formatted}`,
            }));
            setDocFeedback(`✅ สกัดข้อมูลโปรไฟล์จาก ${file.name} สำเร็จ`);
          } else {
            setFormData((prev) => ({
              ...prev,
              jd: `[สรุปคุณสมบัติ JD จาก AI]:\n${formatted}`,
              jdFileName: file.name,
            }));
            setDocFeedback(`✅ อ้างอิงและสกัดทักษะจาก JD ${file.name} สำเร็จ`);
          }
        }
      } catch (err: any) {
        console.error('File upload error:', err);
        setDocFeedback(`❌ วิเคราะห์ไฟล์ไม่สำเร็จ: ${err.message || 'โปรดลองใหม่อีกครั้ง'}`);
      } finally {
        setIsAnalyzingDoc(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSearchCompany = async () => {
    if (!formData.targetCompany.trim() && !formData.companyWebsiteUrl?.trim() && !formData.companyLinkedInUrl?.trim()) return;
    setIsSearchingIntel(true);
    setCompanyIntel(null);
    setIntelSources([]);

    try {
      const res = await fetch('/api/search-company-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: formData.targetCompany,
          companyWebsiteUrl: formData.companyWebsiteUrl,
          companyLinkedInUrl: formData.companyLinkedInUrl,
          role: formData.role,
          jd: formData.jd,
        }),
      });
      const data = await res.json();
      if (data.text) {
        setCompanyIntel(data.text);
        if (data.sources) {
          setIntelSources(data.sources);
        }
      }
    } catch (err: any) {
      console.error('Search error:', err);
    } finally {
      setIsSearchingIntel(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveContext(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden my-8">
        {/* Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-purple-500 animate-fluid-gradient" />

        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                บริบทสัมภาษณ์ & AI Grounding Intelligence
              </h2>
              <p className="text-[11px] text-slate-400">
                ระบุตำแหน่ง บริษัท เว็บไซต์ และอ้างอิง JD เพื่อให้ AI วางกลยุทธ์คำตอบให้ตรงเป้า 100%
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Target Role & Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
                ตำแหน่งเป้าหมาย (Target Role) *
              </label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="เช่น Senior Frontend Engineer, Cloud Architect"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-emerald-400" />
                บริษัทที่สัมภาษณ์ (Target Company)
              </label>
              <input
                type="text"
                value={formData.targetCompany}
                onChange={(e) => setFormData({ ...formData, targetCompany: e.target.value })}
                placeholder="เช่น Google, Agoda, LINE MAN Wongnai"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Targeted Website and LinkedIn Profile Links */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5 font-bold">
                <Globe className="w-3.5 h-3.5" />
                Targeted Web & LinkedIn Intelligence
              </span>
              <button
                type="button"
                onClick={handleSearchCompany}
                disabled={isSearchingIntel || (!formData.targetCompany.trim() && !formData.companyWebsiteUrl?.trim())}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 border border-cyan-500/40 disabled:opacity-40 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]"
              >
                {isSearchingIntel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>สืบค้นข้อมูลเชิงลึกด้วย Google Search</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-cyan-400" />
                  เว็บไซต์บริษัท (Website URL)
                </label>
                <input
                  type="url"
                  value={formData.companyWebsiteUrl || ''}
                  onChange={(e) => setFormData({ ...formData, companyWebsiteUrl: e.target.value })}
                  placeholder="https://company.com/about หรือ careers"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                  <Linkedin className="w-3 h-3 text-blue-400" />
                  โปรไฟล์ LinkedIn บริษัท (LinkedIn URL)
                </label>
                <input
                  type="url"
                  value={formData.companyLinkedInUrl || ''}
                  onChange={(e) => setFormData({ ...formData, companyLinkedInUrl: e.target.value })}
                  placeholder="https://linkedin.com/company/name"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Intel Results Display */}
            {companyIntel && (
              <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-1.5 text-cyan-300 font-bold font-mono">
                  <Sparkles className="w-3.5 h-3.5" />
                  สรุปข้อมูลเชิงลึกบริษัท (วัฒนธรรม, Tech Stack, ข่าวสารล่าสุด):
                </div>
                <div className="whitespace-pre-line max-h-44 overflow-y-auto leading-relaxed pr-1">
                  {companyIntel}
                </div>
                {intelSources.length > 0 && (
                  <div className="pt-2 border-t border-cyan-900/60 flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-slate-400 font-mono">แหล่งอ้างอิง:</span>
                    {intelSources.slice(0, 3).map((s, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 truncate max-w-[160px]">
                        {s.title || s.uri}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Job Description (JD) Direct Upload & Referencing */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-mono uppercase tracking-wider text-emerald-300 flex items-center gap-1.5 font-bold">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                เอกสาร Job Description (JD) ที่สมัคร
              </label>
              {formData.jdFileName && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono">
                  <Paperclip className="w-3 h-3" />
                  อ้างอิง: {formData.jdFileName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-emerald-600/50 hover:border-emerald-400 bg-slate-900/80 cursor-pointer text-xs text-emerald-300 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>อัปโหลดไฟล์ JD (PDF / รูปถ่าย)</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => handleFileUpload(e, 'jd')}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-slate-400">หรือวางข้อความรายละเอียดด้านล่าง</span>
            </div>

            <textarea
              rows={3}
              value={formData.jd}
              onChange={(e) => setFormData({ ...formData, jd: e.target.value })}
              placeholder="วาง Job Description หรือ Requirements ของตำแหน่งงานที่นี่..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 font-sans leading-relaxed"
            />
          </div>

          {/* Resume Upload & Content */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5 font-bold">
                <FileCheck className="w-3.5 h-3.5 text-cyan-400" />
                Resume และ ประวัติการทำงานของผู้สมัคร
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-cyan-600/50 hover:border-cyan-400 bg-slate-900/80 cursor-pointer text-xs text-cyan-300 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>อัปโหลดไฟล์ Resume (PDF / รูปถ่าย)</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => handleFileUpload(e, 'resume')}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-slate-400">ดึงทักษะและโปรเจกต์อัตโนมัติ</span>
            </div>

            <textarea
              rows={3}
              value={formData.resume}
              onChange={(e) => setFormData({ ...formData, resume: e.target.value })}
              placeholder="วางประวัติย่อ ผลงานเด่น ทักษะความเชี่ยวชาญเพื่อให้อ้างอิงในคำตอบ..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-sans leading-relaxed"
            />
          </div>

          {docFeedback && (
            <p className="text-xs text-cyan-400 font-mono flex items-center gap-1 px-1">
              {docFeedback}
            </p>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 text-xs font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              บันทึกและปรับใช้ในการสัมภาษณ์
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
