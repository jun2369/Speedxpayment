import React, { useState } from 'react';
import './App.css';
import FileSplit from './FileSplit';

type PageType = 'home' | 'file-split' | 'other-tools';

interface MenuItem {
  id: PageType;
  title: string;
  description: string;
  icon: string;
  component?: React.FC;
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('home');

  const menuItems: MenuItem[] = [
    {
      id: 'file-split',
      title: 'Excel File Splitter',
      description: 'Split Route Parcel Report',
      icon: '📊',
      component: FileSplit
    },
    {
      id: 'other-tools',
      title: 'Other Tools',
      description: 'More useful tools coming soon',
      icon: '🛠️'
    }
  ];

  const handleNavigate = (page: PageType) => {
    setCurrentPage(page);
  };

  const renderContent = () => {
    if (currentPage === 'home') {
      return (
        <div className="home-container">
          <header className="app-header">
            <h1 className="app-title">
              <span className="title-icon">🚀</span>
              Speedx Payment - Data Processing Toolbox
            </h1>
            <p className="app-subtitle"></p>
          </header>
    
          <div className="tools-grid">
            {menuItems.map((item) => (
              <div
                key={item.id}
                className="tool-card"
                onClick={() => handleNavigate(item.id)}
              >
                <div className="tool-icon">{item.icon}</div>
                <h3 className="tool-title">{item.title}</h3>
                <p className="tool-description">{item.description}</p>
                <button className="tool-button">
                  Start Using →
                </button>
              </div>
            ))}
          </div>
    
          <footer className="app-footer">
            <p></p>
          </footer>
        </div>
      );
    }

    const selectedItem = menuItems.find(item => item.id === currentPage);
    
    if (selectedItem?.component) {
      const Component = selectedItem.component;
      return (
        <div className="page-container">
          <nav className="page-nav">
            <button 
              className="back-button"
              onClick={() => setCurrentPage('home')}
            >
              ← Back to Home
            </button>
            <h2 className="page-title">{selectedItem.title}</h2>
          </nav>
          <Component />
        </div>
      );
    }

    return (
      <div className="page-container">
        <nav className="page-nav">
          <button 
            className="back-button"
            onClick={() => setCurrentPage('home')}
          >
            ← Back to Home
          </button>
          <h2 className="page-title">Other Tools</h2>
        </nav>
        <div className="coming-soon">
          <div className="coming-soon-icon">🚧</div>
          <h3>Coming Soon</h3>
          <p>More useful tools are under development, stay tuned!</p>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      {renderContent()}
    </div>
  );
};

export default App;