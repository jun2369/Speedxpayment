import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

interface FileStats {
  totalRows: number;
  uniqueFiles: number;
  fileNames: string[];
}

type StatusType = 'idle' | 'processing' | 'success' | 'error';

const FileSplit: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<StatusType>('idle');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [stats, setStats] = useState<FileStats | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [hubName, setHubName] = useState<string>('');

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const droppedFile = files[0];
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        // 弹窗询问 Hub/Sub-hub 名称
        const hub = prompt('Please enter the Hub/Sub-hub:');
        if (hub && hub.trim()) {
          setHubName(hub.trim());
          setFile(droppedFile);
          setStatus('');
          setStatusType('idle');
          setStats(null);
        }
      } else {
        setStatus('Please upload Excel file (.xlsx or .xls)');
        setStatusType('error');
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // 弹窗询问 Hub/Sub-hub 名称
      const hub = prompt('Please enter the Hub/Sub-hub:');
      if (hub && hub.trim()) {
        setHubName(hub.trim());
        setFile(selectedFile);
        setStatus('');
        setStatusType('idle');
        setStats(null);
      } else {
        // 如果用户取消或未输入，重置文件输入
        e.target.value = '';
      }
    }
  };

  const processExcel = async () => {
    if (!file) return;

    setStatus('Reading file...');
    setStatusType('processing');
    setProgress('10%');

    try {
      // Read Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      setProgress('25%');
      
      // Get first worksheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON format, preserve all data types
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        raw: false, 
        defval: '',
        dateNF: 'yyyy-mm-dd'
      });
      
      if (jsonData.length === 0) {
        setStatus('Excel file is empty');
        setStatusType('error');
        setProgress('');
        return;
      }

      setProgress('40%');

      // Check if FleeName column exists
      const firstRow = jsonData[0] as Record<string, any>;
      if (!firstRow.hasOwnProperty('FleeName')) {
        setStatus('Column "FleeName" not found. Please ensure the Excel file contains this column');
        setStatusType('error');
        setProgress('');
        return;
      }

      // 过滤只保留 FinalStatus = DELIVERED 的数据
      const deliveredData = jsonData.filter((row: any) => {
        return String(row.FinalStatus || '').toUpperCase().trim() === 'DELIVERED';
      });

      if (deliveredData.length === 0) {
        setStatus('No records with FinalStatus = DELIVERED found');
        setStatusType('error');
        setProgress('');
        return;
      }

      setStatus('Grouping data...');
      setProgress('50%');

      // Group by FleeName (只对 DELIVERED 的数据分组)
      const groupedData: Record<string, any[]> = {};
      deliveredData.forEach((row: any) => {
        const fleeName = String(row.FleeName || 'undefined').trim();
        if (!groupedData[fleeName]) {
          groupedData[fleeName] = [];
        }
        groupedData[fleeName].push(row);
      });

      const fileCount = Object.keys(groupedData).length;
      setStatus(`Generating ${fileCount} files...`);
      setProgress('60%');

      // Create ZIP file
      const zip = new JSZip();
      
      // Create Excel file for each group
      let processedFiles = 0;
      for (const [fleeName, data] of Object.entries(groupedData)) {
        // Create new workbook
        const newWorkbook = XLSX.utils.book_new();
        
        // Remove W and X columns (sync time and planDeliveryDate)
        const filteredData = data.map(row => {
          const newRow = { ...row };
          delete newRow['sync time'];  // W column
          delete newRow['planDeliveryDate'];  // X column
          return newRow;
        });
        
        // Create worksheet, preserve original format
        const newWorksheet = XLSX.utils.json_to_sheet(filteredData, {
          dateNF: 'yyyy-mm-dd'
        });
        
        // Set column width (optional)
        const colWidths = Object.keys(filteredData[0]).map(() => ({ wch: 15 }));
        newWorksheet['!cols'] = colWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
        
        // Generate Excel file binary data
        const excelBuffer = XLSX.write(newWorkbook, { 
          bookType: 'xlsx', 
          type: 'array',
          compression: true
        });
        
        // Clean filename (remove special characters)
        const cleanFleeName = fleeName.replace(/[<>:"/\\|?*]/g, '_').trim();
        
        // Add to ZIP
        zip.file(`${cleanFleeName}.xlsx`, excelBuffer);
        
        processedFiles++;
        const progressPercent = 60 + (processedFiles / fileCount) * 30;
        setProgress(`${Math.round(progressPercent)}%`);
      }

      setStatus('Packaging files...');
      setProgress('95%');

      // Generate ZIP file
      const zipContent = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      // Create download link
      const downloadUrl = URL.createObjectURL(zipContent);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      // 只使用 hubName 作为文件名
      downloadLink.download = `${hubName}.zip`;
      downloadLink.click();
      
      // Clean up URL
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      
      // Display statistics (显示过滤后的统计)
      setStats({
        totalRows: deliveredData.length,
        uniqueFiles: fileCount,
        fileNames: Object.keys(groupedData).slice(0, 10) // Show first 10 only
      });
      
      setStatus(`Success! Generated ${fileCount} Excel files (DELIVERED only) and packaged as ZIP`);
      setStatusType('success');
      setProgress('100%');
      
      // Clear progress bar after 3 seconds
      setTimeout(() => setProgress(''), 3000);
      
    } catch (error) {
      console.error('Processing error:', error);
      setStatus(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatusType('error');
      setProgress('');
    }
  };

  const resetFile = () => {
    setFile(null);
    setStatus('');
    setStatusType('idle');
    setStats(null);
    setProgress('');
    setHubName('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.description}>
          <h3 style={styles.descTitle}>📝 Instructions</h3>
          <ol style={styles.descList}>
            <li>Upload an Excel - Route Disptach Report</li>
            <li>Enter the hub/sub-hub code</li>
            <li>Generate separate Excel files for each FleetName</li>
            <li>All files will be packaged into a ZIP for download</li>
          </ol>
        </div>

        <div 
          style={{
            ...styles.uploadArea,
            ...(isDragging ? styles.uploadAreaDragging : {}),
            ...(file ? styles.uploadAreaWithFile : {})
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !file && document.getElementById('file-input')?.click()}
        >
          {!file ? (
            <>
              <div style={styles.uploadIcon}>📁</div>
              <div style={styles.uploadText}>
                Drag Excel file here
              </div>
              <div style={styles.uploadSubtext}>
                or click to select file
              </div>
            </>
          ) : (
            <>
              <div style={styles.uploadIcon}>📊</div>
              <div style={styles.fileName}>{file.name}</div>
              <div style={styles.fileSize}>
                {(file.size / 1024).toFixed(2)} KB
              </div>
              {hubName && (
                <div style={styles.hubInfo}>
                  Hub/Sub-hub: <strong>{hubName}</strong>
                </div>
              )}
            </>
          )}
          
          <input
            id="file-input"
            type="file"
            style={styles.fileInput}
            accept=".xlsx,.xls"
            onChange={handleFileChange}
          />
        </div>

        {file && (
          <div style={styles.actions}>
            <button 
              style={{
                ...styles.btn,
                ...styles.btnPrimary
              }}
              onClick={processExcel}
              disabled={statusType === 'processing'}
            >
              {statusType === 'processing' ? 'Processing...' : 'Start Processing'}
            </button>
            <button 
              style={{
                ...styles.btn,
                ...styles.btnSecondary
              }}
              onClick={resetFile}
              disabled={statusType === 'processing'}
            >
              Select Again
            </button>
          </div>
        )}

        {progress && statusType === 'processing' && (
          <div style={styles.progressContainer}>
            <div style={styles.progressBar}>
              <div 
                style={{
                  ...styles.progressFill,
                  width: progress
                }}
              />
            </div>
            <div style={styles.progressText}>{progress}</div>
          </div>
        )}

        {status && (
          <div style={{
            ...styles.status,
            ...(statusType === 'processing' && styles.statusProcessing),
            ...(statusType === 'success' && styles.statusSuccess),
            ...(statusType === 'error' && styles.statusError)
          }}>
            {status}
          </div>
        )}

        {stats && (
          <div style={styles.statsContainer}>
            <h3 style={styles.statsTitle}>📊 Processing Statistics</h3>
            <div style={styles.statsGrid}>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>Total Rows (DELIVERED)</div>
                <div style={styles.statValue}>{stats.totalRows}</div>
              </div>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>Files Generated</div>
                <div style={styles.statValue}>{stats.uniqueFiles}</div>
              </div>
            </div>
            {stats.fileNames.length > 0 && (
              <div style={styles.fileList}>
                <div style={styles.fileListTitle}>File Name Preview:</div>
                {stats.fileNames.map((name, index) => (
                  <div key={index} style={styles.fileListItem}>
                    • {name}.xlsx
                  </div>
                ))}
                {stats.uniqueFiles > 10 && (
                  <div style={styles.fileListMore}>
                    ... and {stats.uniqueFiles - 10} more files
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: 'calc(100vh - 80px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '40px 20px',
  },
  content: {
    background: 'white',
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
    padding: '40px',
    maxWidth: '800px',
    width: '100%',
  },
  description: {
    background: 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)',
    borderRadius: '15px',
    padding: '20px',
    marginBottom: '30px',
  },
  descTitle: {
    fontSize: '1.25rem',
    color: '#333',
    marginBottom: '15px',
    fontWeight: '600',
  },
  descList: {
    color: '#666',
    lineHeight: '1.8',
    paddingLeft: '20px',
  },
  uploadArea: {
    border: '3px dashed #667eea',
    borderRadius: '15px',
    padding: '60px 40px',
    textAlign: 'center' as const,
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    backgroundColor: '#f8f9ff',
  },
  uploadAreaDragging: {
    backgroundColor: '#e0e5ff',
    borderColor: '#764ba2',
    transform: 'scale(1.02)',
  },
  uploadAreaWithFile: {
    backgroundColor: '#f0f2ff',
    cursor: 'default',
  },
  uploadIcon: {
    fontSize: '4rem',
    marginBottom: '20px',
  },
  uploadText: {
    color: '#333',
    fontSize: '1.25rem',
    fontWeight: '500',
    marginBottom: '8px',
  },
  uploadSubtext: {
    color: '#999',
    fontSize: '1rem',
  },
  fileName: {
    color: '#333',
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '8px',
  },
  fileSize: {
    color: '#666',
    fontSize: '0.9rem',
  },
  hubInfo: {
    marginTop: '10px',
    color: '#667eea',
    fontSize: '0.95rem',
  },
  fileInput: {
    display: 'none',
  },
  actions: {
    display: 'flex',
    gap: '15px',
    marginTop: '30px',
    justifyContent: 'center',
  },
  btn: {
    padding: '12px 30px',
    borderRadius: '25px',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    border: 'none',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
  },
  btnSecondary: {
    background: '#f0f0f0',
    color: '#666',
  },
  progressContainer: {
    marginTop: '20px',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    transition: 'width 0.3s ease',
  },
  progressText: {
    textAlign: 'center' as const,
    marginTop: '10px',
    color: '#666',
    fontSize: '0.9rem',
  },
  status: {
    marginTop: '20px',
    padding: '15px',
    borderRadius: '10px',
    textAlign: 'center' as const,
    fontWeight: '500',
  },
  statusProcessing: {
    backgroundColor: '#fff3cd',
    color: '#856404',
  },
  statusSuccess: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  statusError: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  statsContainer: {
    marginTop: '30px',
    padding: '20px',
    backgroundColor: '#f8f9ff',
    borderRadius: '15px',
  },
  statsTitle: {
    fontSize: '1.25rem',
    color: '#333',
    marginBottom: '20px',
    fontWeight: '600',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px',
  },
  statItem: {
    background: 'white',
    padding: '20px',
    borderRadius: '10px',
    textAlign: 'center' as const,
  },
  statLabel: {
    fontSize: '0.9rem',
    color: '#999',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  fileList: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '10px',
  },
  fileListTitle: {
    fontSize: '0.9rem',
    color: '#666',
    marginBottom: '10px',
    fontWeight: '600',
  },
  fileListItem: {
    color: '#333',
    padding: '5px 0',
    fontSize: '0.9rem',
  },
  fileListMore: {
    color: '#999',
    fontStyle: 'italic',
    marginTop: '10px',
    fontSize: '0.9rem',
  },
};

export default FileSplit;