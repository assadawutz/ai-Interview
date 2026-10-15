import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { SmartAnswer } from '../types/interview';

export const generateInterviewReport = (answers: SmartAnswer[]) => {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('Interview Session Report', 14, 20);
  
  const tableData = answers.map((a) => [
    a.question,
    a.directAnswer || 'N/A',
    a.confidence ? `${a.confidence}%` : 'N/A'
  ]);
  
  (doc as any).autoTable({
    head: [['Question', 'STAR Response', 'Confidence']],
    body: tableData,
    startY: 30,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: [8, 145, 178] }, // Cyan 600
  });
  
  doc.save('interview-report.pdf');
};
