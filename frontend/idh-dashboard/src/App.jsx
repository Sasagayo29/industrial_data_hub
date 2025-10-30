import React, { useState, useCallback } from "react";
import DataSourceList from "./components/DataSourceList.jsx";
import DataSourceForm from "./components/DataSourceForm.jsx";
import "./App.css";

function App() {
    const [listKey, setListKey] = useState(Date.now());

    const handleDataSourceCreated = useCallback(() => {
        console.log(
            "App.jsx: Upload concluído. Atualizando listKey para recarregar a lista."
        );
        setListKey(Date.now());
    }, []);

    return (
        <div className="App">
            <header className="App-header">
                <h1>Industrial Data Hub (IDH)</h1>
            </header>
            <main>
                <DataSourceForm onDataSourceCreated={handleDataSourceCreated} />
                <hr />

                {/* --- CORREÇÃO: 'key' foi removida --- */}
                <DataSourceList listKey={listKey} />
            </main>
        </div>
    );
}

export default App;
