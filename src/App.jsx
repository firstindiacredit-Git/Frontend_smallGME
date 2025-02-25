import React, { useState } from "react";
import axios from "axios";

const ScraperApp = () => {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);
    setProgress(0);
    setProgressMessage('Starting search...');
    setIsExtracting(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('http://localhost:3001/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword, location }),
        signal: controller.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            console.log('Received data:', data);

            // Store session ID if received
            if (data.sessionId) {
              setSessionId(data.sessionId);
            }

            // Ensure results is always an array
            const currentResults = Array.isArray(data.results) ? data.results : [];
            
            if (data.isComplete) {
              setResults(currentResults);
              setFilename(data.filename);
              setProgress(100);
              setProgressMessage(data.message || 'Completed');
              setLoading(false);
              setIsExtracting(false);
              console.log('Final results count:', currentResults.length);
              break;
            } else {
              setResults(currentResults);
              const newProgress = Math.min(Math.round((data.total / 100) * 100), 99);
              setProgress(newProgress);
              setProgressMessage(data.message || 'Processing...');
              console.log('Current results count:', currentResults.length);
            }
          } catch (e) {
            console.error('Error parsing chunk:', e);
            setError('Error processing data from server');
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setProgressMessage('Extraction stopped');
      } else {
        setError(err.message || "Failed to fetch data.");
        setProgressMessage('Error occurred during search');
        setResults([]);
      }
    } finally {
      setLoading(false);
      setIsExtracting(false);
      setAbortController(null);
      setSessionId(null);
    }
  };

  const handleStopExtraction = async () => {
    if (sessionId) {
      try {
        // Notify backend to stop scraping
        const response = await fetch(`http://localhost:3001/stop-scraping/${sessionId}`, {
          method: 'POST',
        });
        
        // Abort frontend request
        if (abortController) {
          abortController.abort();
        }
        
        setProgressMessage('Extraction stopped');
        setIsExtracting(false);
        // Don't clear filename here as it will be set by the final update from backend
      } catch (error) {
        console.error('Error stopping extraction:', error);
      }
    }
  };

  const handleDownload = async () => {
    try {
      // Create Excel file from current results
      const response = await fetch('http://localhost:3001/create-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ results })
      });

      if (!response.ok) {
        throw new Error('Failed to create Excel file');
      }

      const data = await response.json();
      const { filename } = data;

      // Download the created file
      const downloadResponse = await axios.get(`http://localhost:3001/download/${filename}`, {
        responseType: 'blob'
      });
      
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([downloadResponse.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `google_maps_results.xlsx`);
      
      // Append to html link element page
      document.body.appendChild(link);
      
      // Start download
      link.click();
      
      // Clean up and remove the link
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      setError("Error downloading file");
    }
  };

  // Export results to CSV
  const exportToCSV = () => {
    if (results.length === 0) return;

    const headers = ['Title', 'Address', 'Website', 'Rating', 'Reviews', 'Phone', 'Country Code', 'Category'];
    const csvContent = [
      headers.join(','),
      ...results.map(result => [
        `"${result.title || ''}"`,
        `"${result.address || ''}"`,
        `"${result.website || ''}"`,
        result.rating || '',
        result.reviews || '',
        `"${result.phone || ''}"`,
        `"${result.countryCode || ''}"`,
        `"${result.category || ''}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `google_maps_results_${keyword}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="bg-red-600 p-4 text-white flex justify-between items-center">
        <h1 className="text-xl font-semibold">Google Map Extractor</h1>
        {(filename || (!isExtracting && results.length > 0)) && (
          <button
            onClick={handleDownload}
            className="bg-white text-red-600 px-6 py-2 rounded-lg hover:bg-gray-100 flex items-center space-x-2 font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span>Download Excel</span>
          </button>
        )}
      </div>
      
      <div className="p-4">
        {/* Search Form */}
        <div className="flex space-x-4 mb-4">
          <div className="bg-gray-100 rounded p-4 w-64">
            <h2 className="font-medium mb-2">Keywords (1)</h2>
            <input
              type="text"
              placeholder="Enter keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-teal-500 mb-4"
            />
            <div className="mt-4">
              <div className="text-sm text-gray-600 mb-1">Location</div>
              <input
                type="text"
                placeholder="Enter location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-teal-500"
              />
            </div>
            {loading && (
              <div className="mt-4">
                <div className="flex flex-col space-y-2 mb-2">
                  <div className="text-lg font-medium text-gray-700">{progressMessage}</div>
                  <div className="text-sm text-gray-500">Progress: {progress}%</div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-teal-500 h-3 rounded-full transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="bg-teal-500 text-white px-4 py-1 rounded">
                  {(results || []).length} RESULTS FOUND
                </div>
                <button
                  onClick={() => {
                    setResults([]);
                    setFilename(null);
                  }}
                  className="text-gray-600 hover:text-gray-800 px-4 py-1 border rounded"
                >
                  Clear Data
                </button>
                <button
                  onClick={exportToCSV}
                  disabled={results.length === 0}
                  className="text-gray-600 hover:text-gray-800 px-4 py-1 border rounded"
                >
                  Extract Email
                </button>
                <button
                  onClick={isExtracting ? handleStopExtraction : handleSearch}
                  disabled={!keyword}
                  className="bg-teal-500 text-white px-4 py-1 rounded hover:bg-teal-600 disabled:bg-gray-400"
                >
                  {isExtracting ? "Stop Extracting" : "Start Extracting"}
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  className="px-3 py-1 border rounded-full pl-8 focus:outline-none focus:border-teal-500"
                />
                <svg className="w-4 h-4 absolute left-2 top-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Results Table */}
            {results.length > 0 && (
              <div className="mt-4">
                <div className="relative border border-gray-300 rounded-lg">
                  <div className="overflow-x-auto">
                    <div className="max-h-[600px] overflow-y-auto">
                      <table className="min-w-full bg-white">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-2 border-b bg-gray-100">Title</th>
                            <th className="px-4 py-2 border-b bg-gray-100">Category</th>
                            <th className="px-4 py-2 border-b bg-gray-100">Rating</th>
                            <th className="px-4 py-2 border-b bg-gray-100">Reviews</th>
                            <th className="px-4 py-2 border-b bg-gray-100">Phone</th>
                            <th className="px-4 py-2 border-b bg-gray-100">Country Code</th>
                            <th className="px-4 py-2 border-b bg-gray-100">Address</th>
                            <th className="px-4 py-2 border-b bg-gray-100">Website</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((result, index) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                              <td className="px-4 py-2 border-b whitespace-normal">{result.title}</td>
                              <td className="px-4 py-2 border-b whitespace-normal">{result.category || '-'}</td>
                              <td className="px-4 py-2 border-b">{result.rating || '-'}</td>
                              <td className="px-4 py-2 border-b">{result.reviews || '-'}</td>
                              <td className="px-4 py-2 border-b">{result.phone || '-'}</td>
                              <td className="px-4 py-2 border-b">{result.countryCode || '-'}</td>
                              <td className="px-4 py-2 border-b whitespace-normal">{result.address || '-'}</td>
                              <td className="px-4 py-2 border-b">
                                {result.website ? (
                                  <a 
                                    href={result.website} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    Visit
                                  </a>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Results count */}
                <div className="mt-4 flex justify-end items-center">
                  <div className="text-gray-600">
                    Total Results: {results.length}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScraperApp;
