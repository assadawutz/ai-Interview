import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="panel" style={{ maxWidth: 600, margin: '10vh auto', padding: 32 }}>
          <h1>Interview Pulse</h1>
          <p style={{ margin: '20px 0' }}>
            ไม่สามารถเปิดหน้าจอนี้ได้ กรุณาลองโหลดใหม่ ประวัติที่บันทึกไว้ยังอยู่ในเบราว์เซอร์
            <br />
            This screen could not load. Try reloading; saved local sessions remain in browser
            storage.
          </p>
          <button className="button primary" onClick={() => window.location.reload()}>
            โหลดใหม่ · Reload
          </button>
        </main>
      );
    return this.props.children;
  }
}
