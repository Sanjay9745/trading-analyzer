import urllib.request
import re
import csv
import os

def fetch_sp500():
    print("Fetching S&P 500 from Wikipedia...")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode('utf-8')
        
        table_match = re.search(r'<table[^>]*id="constituents"[^>]*>(.*?)</table>', html, re.DOTALL)
        if not table_match:
            return None
        
        table_content = table_match.group(1)
        rows = re.findall(r'<tr>(.*?)</tr>', table_content, re.DOTALL)
        
        stocks = []
        for row in rows[1:]: # skip header
            cols = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
            if len(cols) >= 4:
                symbol = re.sub(r'<[^>]*>', '', cols[0]).strip()
                # yfinance uses hyphens instead of dots for classes (e.g. BRK.B -> BRK-B)
                symbol = symbol.replace('.', '-')
                name = re.sub(r'<[^>]*>', '', cols[1]).strip()
                # Clean up html entities
                name = name.replace('&amp;', '&').replace('&#39;', "'")
                sector = re.sub(r'<[^>]*>', '', cols[3]).strip()
                stocks.append({
                    "symbol": symbol,
                    "name": name,
                    "exchange": "US",
                    "sector": sector
                })
        print(f"Successfully fetched {len(stocks)} S&P 500 stocks.")
        return stocks
    except Exception as e:
        print(f"Error fetching S&P 500: {e}")
        return None

def fetch_nifty500():
    print("Fetching Nifty 500 from NSE India...")
    url = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            lines = [line.decode('utf-8-sig') for line in response.readlines()]
        
        reader = csv.DictReader(lines)
        nse_stocks = []
        bse_stocks = []
        
        for row in reader:
            if 'Symbol' not in row or 'Company Name' not in row:
                continue
            symbol = row['Symbol'].strip()
            name = row['Company Name'].strip()
            sector = row.get('Industry', 'Financial Services').strip()
            
            # Map sectors to unified names if possible
            if not sector:
                sector = "Financial Services"
                
            # Add to NSE
            nse_stocks.append({
                "symbol": f"{symbol}.NS",
                "name": name,
                "exchange": "NSE",
                "sector": sector
            })
            # Add to BSE
            bse_stocks.append({
                "symbol": f"{symbol}.BO",
                "name": name,
                "exchange": "BSE",
                "sector": sector
            })
            
        print(f"Successfully fetched {len(nse_stocks)} Nifty 500 stocks.")
        return nse_stocks, bse_stocks
    except Exception as e:
        print(f"Error fetching Nifty 500: {e}")
        return None

def get_fallback_stocks():
    # A massive fallback list of 400+ top stocks (US, NSE, BSE) if fetching fails
    print("Loading predefined fallback stock catalog...")
    
    # 150 top US stocks
    us_symbols = [
        ("AAPL", "Apple Inc.", "Technology"), ("MSFT", "Microsoft Corporation", "Technology"),
        ("GOOGL", "Alphabet Inc.", "Technology"), ("GOOG", "Alphabet Inc.", "Technology"),
        ("AMZN", "Amazon.com Inc.", "Consumer Cyclical"), ("NVDA", "NVIDIA Corporation", "Technology"),
        ("TSLA", "Tesla Inc.", "Consumer Cyclical"), ("META", "Meta Platforms Inc.", "Technology"),
        ("NFLX", "Netflix Inc.", "Communication Services"), ("AMD", "Advanced Micro Devices", "Technology"),
        ("INTC", "Intel Corporation", "Technology"), ("QCOM", "Qualcomm Inc.", "Technology"),
        ("AVGO", "Broadcom Inc.", "Technology"), ("CSCO", "Cisco Systems Inc.", "Technology"),
        ("ADBE", "Adobe Inc.", "Technology"), ("CRM", "Salesforce Inc.", "Technology"),
        ("PLTR", "Palantir Technologies", "Technology"), ("PYPL", "PayPal Holdings", "Financial Services"),
        ("V", "Visa Inc.", "Financial Services"), ("MA", "Mastercard Inc.", "Financial Services"),
        ("JPM", "JPMorgan Chase & Co.", "Financial Services"), ("BAC", "Bank of America", "Financial Services"),
        ("WMT", "Walmart Inc.", "Consumer Defensive"), ("PG", "Procter & Gamble", "Consumer Defensive"),
        ("KO", "Coca-Cola Company", "Consumer Defensive"), ("PEP", "PepsiCo Inc.", "Consumer Defensive"),
        ("COST", "Costco Wholesale", "Consumer Defensive"), ("DIS", "Walt Disney Company", "Communication Services"),
        ("NKE", "Nike Inc.", "Consumer Cyclical"), ("MCD", "McDonald's Corp.", "Consumer Cyclical"),
        ("SBUX", "Starbucks Corp.", "Consumer Cyclical"), ("HD", "Home Depot Inc.", "Consumer Cyclical"),
        ("XOM", "Exxon Mobil Corp.", "Energy"), ("CVX", "Chevron Corporation", "Energy"),
        ("PFE", "Pfizer Inc.", "Healthcare"), ("JNJ", "Johnson & Johnson", "Healthcare"),
        ("UNH", "UnitedHealth Group", "Healthcare"), ("MRK", "Merck & Co.", "Healthcare"),
        ("ABT", "Abbott Laboratories", "Healthcare"), ("LLY", "Eli Lilly & Co.", "Healthcare"),
        ("CAT", "Caterpillar Inc.", "Industrials"), ("GE", "General Electric", "Industrials"),
        ("MMM", "3M Company", "Industrials"), ("HON", "Honeywell International", "Industrials"),
        ("BA", "Boeing Company", "Industrials"), ("T", "AT&T Inc.", "Communication Services"),
        ("VZ", "Verizon Communications", "Communication Services"), ("UPS", "United Parcel Service", "Industrials"),
        ("FDX", "FedEx Corporation", "Industrials"), ("GS", "Goldman Sachs Group", "Financial Services"),
        ("MS", "Morgan Stanley", "Financial Services"), ("IBM", "IBM Corporation", "Technology"),
        ("ORCL", "Oracle Corporation", "Technology"), ("TXN", "Texas Instruments", "Technology"),
        ("AMAT", "Applied Materials", "Technology"), ("LRCX", "Lam Research", "Technology"),
        ("MU", "Micron Technology", "Technology"), ("ADI", "Analog Devices", "Technology"),
        ("PANW", "Palo Alto Networks", "Technology"), ("SNPS", "Synopsys Inc.", "Technology"),
        ("CDNS", "Cadence Design Systems", "Technology"), ("FTNT", "Fortinet Inc.", "Technology"),
        ("MCHP", "Microchip Technology", "Technology"), ("NXPI", "NXP Semiconductors", "Technology"),
        ("CRWD", "CrowdStrike Holdings", "Technology"), ("DDOG", "Datadog Inc.", "Technology"),
        ("NET", "Cloudflare Inc.", "Technology"), ("SNOW", "Snowflake Inc.", "Technology"),
        ("TEAM", "Atlassian Corp.", "Technology"), ("WDAY", "Workday Inc.", "Technology"),
        ("ADSK", "Autodesk Inc.", "Technology"), ("ANSYS", "Ansys Inc.", "Technology"),
        ("SPLK", "Splunk Inc.", "Technology"), ("ZM", "Zoom Video", "Technology"),
        ("DOCU", "DocuSign Inc.", "Technology"), ("OKTA", "Okta Inc.", "Technology"),
        ("MDB", "MongoDB Inc.", "Technology"), ("ESTC", "Elastic N.V.", "Technology"),
        ("PATH", "UiPath Inc.", "Technology"), ("AI", "C3.ai Inc.", "Technology"),
        ("COIN", "Coinbase Global", "Financial Services"), ("HOOD", "Robinhood Markets", "Financial Services"),
        ("SQ", "Block Inc.", "Technology"), ("SOFI", "SoFi Technologies", "Financial Services"),
        ("AFRM", "Affirm Holdings", "Financial Services"), ("UPST", "Upstart Holdings", "Financial Services"),
        ("DKNG", "DraftKings Inc.", "Consumer Cyclical"), ("RBLX", "Roblox Corporation", "Technology"),
        ("U", "Unity Software", "Technology"), ("SHOP", "Shopify Inc.", "Technology"),
        ("SPOT", "Spotify Technology", "Communication Services"), ("SNAP", "Snap Inc.", "Technology"),
        ("PINS", "Pinterest Inc.", "Technology"), ("TTD", "The Trade Desk", "Technology"),
        ("ETSY", "Etsy Inc.", "Consumer Cyclical"), ("EBAY", "eBay Inc.", "Consumer Cyclical"),
        ("MELI", "MercadoLibre Inc.", "Consumer Cyclical"), ("SE", "Sea Limited", "Consumer Cyclical"),
        ("BABA", "Alibaba Group", "Consumer Cyclical"), ("PDD", "PDD Holdings", "Consumer Cyclical"),
        ("JD", "JD.com Inc.", "Consumer Cyclical"), ("BIDU", "Baidu Inc.", "Technology"),
        ("NTES", "NetEase Inc.", "Technology"), ("TCOM", "Trip.com Group", "Consumer Cyclical"),
        ("NIO", "NIO Inc.", "Consumer Cyclical"), ("LI", "Li Auto Inc.", "Consumer Cyclical"),
        ("XPEV", "XPeng Inc.", "Consumer Cyclical"), ("BYDDY", "BYD Co. Ltd.", "Consumer Cyclical"),
        ("LCID", "Lucid Group", "Consumer Cyclical"), ("RIVN", "Rivian Automotive", "Consumer Cyclical"),
        ("F", "Ford Motor Company", "Consumer Cyclical"), ("GM", "General Motors", "Consumer Cyclical"),
        ("TM", "Toyota Motor", "Consumer Cyclical"), ("HMC", "Honda Motor", "Consumer Cyclical"),
        ("RACE", "Ferrari N.V.", "Consumer Cyclical"), ("TSM", "TSMC Ltd.", "Technology"),
        ("ASML", "ASML Holding", "Technology"), ("SAP", "SAP SE", "Technology"),
        ("NVO", "Novo Nordisk", "Healthcare"), ("AZN", "AstraZeneca PLC", "Healthcare"),
        ("SNY", "Sanofi", "Healthcare"), ("GSK", "GSK PLC", "Healthcare"),
        ("BP", "BP PLC", "Energy"), ("SHEL", "Shell PLC", "Energy"),
        ("TTE", "TotalEnergies", "Energy"), ("HMY", "Harmony Gold", "Basic Materials"),
        ("AU", "AngloGold Ashanti", "Basic Materials"), ("GFI", "Gold Fields Ltd.", "Basic Materials"),
        ("FCX", "Freeport-McMoRan", "Basic Materials"), ("VALE", "Vale S.A.", "Basic Materials"),
        ("RIO", "Rio Tinto", "Basic Materials"), ("BHP", "BHP Group", "Basic Materials")
    ]
    
    # 150 top Indian stocks (representing both NSE and BSE)
    in_symbols = [
        ("RELIANCE", "Reliance Industries Limited", "Energy"),
        ("TCS", "Tata Consultancy Services Limited", "Technology"),
        ("INFY", "Infosys Limited", "Technology"),
        ("HDFCBANK", "HDFC Bank Limited", "Financial Services"),
        ("ICICIBANK", "ICICI Bank Limited", "Financial Services"),
        ("SBIN", "State Bank of India", "Financial Services"),
        ("BHARTIARTL", "Bharti Airtel Limited", "Communication Services"),
        ("ITC", "ITC Limited", "Consumer Defensive"),
        ("HINDUNILVR", "Hindustan Unilever Limited", "Consumer Defensive"),
        ("LT", "Larsen & Toubro Limited", "Industrials"),
        ("AXISBANK", "Axis Bank Limited", "Financial Services"),
        ("KOTAKBANK", "Kotak Mahindra Bank Limited", "Financial Services"),
        ("ADANIENT", "Adani Enterprises Limited", "Industrials"),
        ("ADANIPORTS", "Adani Ports & SEZ Limited", "Industrials"),
        ("BAJFINANCE", "Bajaj Finance Limited", "Financial Services"),
        ("BAJAJFINSV", "Bajaj Finserv Limited", "Financial Services"),
        ("ASIANPAINT", "Asian Paints Limited", "Industrials"),
        ("MARUTI", "Maruti Suzuki India Limited", "Consumer Cyclical"),
        ("M&M", "Mahindra & Mahindra Limited", "Consumer Cyclical"),
        ("TATAMOTORS", "Tata Motors Limited", "Consumer Cyclical"),
        ("TATASTEEL", "Tata Steel Limited", "Basic Materials"),
        ("TATAPOWER", "Tata Power Company Limited", "Utilities"),
        ("TATAELXSI", "Tata Elxsi Limited", "Technology"),
        ("TATACHEM", "Tata Chemicals Limited", "Basic Materials"),
        ("TATACOMM", "Tata Communications Limited", "Communication Services"),
        ("JSWSTEEL", "JSW Steel Limited", "Basic Materials"),
        ("HINDALCO", "Hindalco Industries Limited", "Basic Materials"),
        ("COALINDIA", "Coal India Limited", "Energy"),
        ("NTPC", "NTPC Limited", "Utilities"),
        ("POWERGRID", "Power Grid Corporation of India", "Utilities"),
        ("ONGC", "Oil & Natural Gas Corporation", "Energy"),
        ("BPCL", "Bharat Petroleum Corporation", "Energy"),
        ("IOC", "Indian Oil Corporation Limited", "Energy"),
        ("SUNPHARMA", "Sun Pharmaceutical Industries", "Healthcare"),
        ("CIPLA", "Cipla Limited", "Healthcare"),
        ("DRREDDY", "Dr. Reddy's Laboratories", "Healthcare"),
        ("APOLLOHOSP", "Apollo Hospitals Enterprise", "Healthcare"),
        ("ULTRACEMCO", "UltraTech Cement Limited", "Basic Materials"),
        ("GRASIM", "Grasim Industries Limited", "Basic Materials"),
        ("WIPRO", "Wipro Limited", "Technology"),
        ("HCLTECH", "HCL Technologies Limited", "Technology"),
        ("TECHM", "Tech Mahindra Limited", "Technology"),
        ("NESTLEIND", "Nestle India Limited", "Consumer Defensive"),
        ("BRITANNIA", "Britannia Industries Limited", "Consumer Defensive"),
        ("TATACONSUM", "Tata Consumer Products Limited", "Consumer Defensive"),
        ("EICHERMOT", "Eicher Motors Limited", "Consumer Cyclical"),
        ("HEROMOTOCO", "Hero MotoCorp Limited", "Consumer Cyclical"),
        ("TVSMOTOR", "TVS Motor Company Limited", "Consumer Cyclical"),
        ("INDUSINDBK", "IndusInd Bank Limited", "Financial Services"),
        ("HDFCLIFE", "HDFC Life Insurance", "Financial Services"),
        ("SBILIFE", "SBI Life Insurance", "Financial Services"),
        ("BAJAJ-AUTO", "Bajaj Auto Limited", "Consumer Cyclical"),
        ("DIVISLAB", "Divi's Laboratories Limited", "Healthcare"),
        ("ASHOKLEY", "Ashok Leyland Limited", "Consumer Cyclical"),
        ("IRFC", "Indian Railway Finance Corporation", "Financial Services"),
        ("HFCL", "HFCL Limited", "Technology"),
        ("SUZLON", "Suzlon Energy Limited", "Utilities"),
        ("RVNL", "Rail Vikas Nigam Limited", "Industrials"),
        ("HAL", "Hindustan Aeronautics Limited", "Industrials"),
        ("BEL", "Bharat Electronics Limited", "Industrials"),
        ("IRCTC", "Indian Railway Catering & Tourism", "Consumer Cyclical"),
        ("ZOMATO", "Zomato Limited", "Consumer Cyclical"),
        ("JIOFIN", "Jio Financial Services Limited", "Financial Services"),
        ("YESBANK", "Yes Bank Limited", "Financial Services"),
        ("PNB", "Punjab National Bank", "Financial Services"),
        ("RECLTD", "REC Limited", "Financial Services"),
        ("PFC", "Power Finance Corporation", "Financial Services"),
        ("BHEL", "Bharat Heavy Electricals Limited", "Industrials"),
        ("NHPC", "NHPC Limited", "Utilities"),
        ("MRF", "MRF Limited", "Consumer Cyclical"),
        ("PIDILITIND", "Pidilite Industries Limited", "Industrials"),
        ("SIEMENS", "Siemens Limited", "Industrials"),
        ("DLF", "DLF Limited", "Real Estate"),
        ("ADANIPOWER", "Adani Power Limited", "Utilities"),
        ("ADANIGREEN", "Adani Green Energy Limited", "Utilities"),
        ("ATGL", "Adani Total Gas Limited", "Utilities"),
        ("AMBUJACEM", "Ambuja Cements Limited", "Basic Materials"),
        ("ACC", "ACC Limited", "Basic Materials"),
        ("NYKAA", "FSN E-Commerce Ventures (Nykaa)", "Consumer Cyclical"),
        ("PAYTM", "One 97 Communications (Paytm)", "Financial Services"),
        ("AWL", "Adani Wilmar Limited", "Consumer Defensive"),
        ("BANKBARODA", "Bank of Baroda", "Financial Services"),
        ("UNIONBANK", "Union Bank of India", "Financial Services"),
        ("CANBK", "Canara Bank", "Financial Services"),
        ("IDFCFIRSTB", "IDFC First Bank Limited", "Financial Services"),
        ("FEDERALBNK", "Federal Bank Limited", "Financial Services"),
        ("BANDHANBNK", "Bandhan Bank Limited", "Financial Services"),
        ("GMRINFRA", "GMR Airports Infrastructure", "Industrials"),
        ("IRCON", "Ircon International Limited", "Industrials"),
        ("HUDCO", "Housing & Urban Development Corp", "Financial Services"),
        ("SJVN", "SJVN Limited", "Utilities"),
        ("NBCC", "NBCC (India) Limited", "Industrials"),
        ("LICI", "Life Insurance Corporation of India", "Financial Services"),
        ("TRENT", "Trent Limited", "Consumer Cyclical"),
        ("JSL", "Jindal Stainless Limited", "Basic Materials"),
        ("SAIL", "Steel Authority of India Limited", "Basic Materials"),
        ("NMDC", "NMDC Limited", "Basic Materials"),
        ("NATIONALUM", "National Aluminium Company", "Basic Materials"),
        ("HINDCOPPER", "Hindustan Copper Limited", "Basic Materials"),
        ("VEDL", "Vedanta Limited", "Basic Materials"),
        ("TATACOMM", "Tata Communications Limited", "Communication Services"),
        ("TATAINVEST", "Tata Investment Corporation", "Financial Services"),
        ("VOLTAS", "Voltas Limited", "Industrials"),
        ("BATAINDIA", "Bata India Limited", "Consumer Cyclical"),
        ("COLPAL", "Colgate-Palmolive (India) Limited", "Consumer Defensive"),
        ("DABUR", "Dabur India Limited", "Consumer Defensive"),
        ("MARICO", "Marico Limited", "Consumer Defensive"),
        ("GODREJCP", "Godrej Consumer Products Limited", "Consumer Defensive"),
        ("BERGEPAINT", "Berger Paints India Limited", "Industrials"),
        ("MUTHOOTFIN", "Muthoot Finance Limited", "Financial Services"),
        ("CHOLAFIN", "Cholamandalam Investment", "Financial Services"),
        ("MANAPPURAM", "Manappuram Finance Limited", "Financial Services"),
        ("L&TFH", "L&T Finance Holdings Limited", "Financial Services"),
        ("PFC", "Power Finance Corporation", "Financial Services"),
        ("PEL", "Piramal Enterprises Limited", "Financial Services"),
        ("LICHSGFIN", "LIC Housing Finance Limited", "Financial Services"),
        ("IBULHSGFIN", "Indiabulls Housing Finance", "Financial Services"),
        ("HINDZINC", "Hindustan Zinc Limited", "Basic Materials"),
        ("APOLLOTYRE", "Apollo Tyres Limited", "Consumer Cyclical"),
        ("BALKRISIND", "Balkrishna Industries Limited", "Consumer Cyclical"),
        ("MRF", "MRF Limited", "Consumer Cyclical"),
        ("CEATLTD", "CEAT Limited", "Consumer Cyclical"),
        ("JKTYRE", "JK Tyre & Industries Limited", "Consumer Cyclical"),
        ("EXIDEIND", "Exide Industries Limited", "Industrials"),
        ("AMARAJABAT", "Amara Raja Energy & Mobility", "Industrials"),
        ("GLENMARK", "Glenmark Pharmaceuticals", "Healthcare"),
        ("LUPIN", "Lupin Limited", "Healthcare"),
        ("AUROPHARMA", "Aurobindo Pharma Limited", "Healthcare"),
        ("BIOCON", "Biocon Limited", "Healthcare"),
        ("TORNTPHARM", "Torrent Pharmaceuticals", "Healthcare"),
        ("ALCHEM", "Alkem Laboratories Limited", "Healthcare"),
        ("IPCALAB", "Ipca Laboratories Limited", "Healthcare"),
        ("JBCHEPHARM", "J.B. Chemicals & Pharma", "Healthcare"),
        ("ZYDUSLIFE", "Zydus Lifesciences Limited", "Healthcare"),
        ("LAURUSLABS", "Laurus Labs Limited", "Healthcare"),
        ("METROPOLIS", "Metropolis Healthcare Limited", "Healthcare"),
        ("LALPATHLAB", "Dr. Lal PathLabs Limited", "Healthcare"),
        ("BOSCHLTD", "Bosch Limited", "Industrials"),
        ("ABB", "ABB India Limited", "Industrials"),
        ("CGPOWER", "CG Power & Industrial Solutions", "Industrials"),
        ("HAVELLS", "Havells India Limited", "Consumer Cyclical"),
        ("POLYCAB", "Polycab India Limited", "Industrials"),
        ("KEI", "KEI Industries Limited", "Industrials")
    ]
    
    stocks = []
    for sym, name, sec in us_symbols:
        stocks.append({
            "symbol": sym,
            "name": name,
            "exchange": "US",
            "sector": sec
        })
        
    for sym, name, sec in in_symbols:
        stocks.append({
            "symbol": f"{sym}.NS",
            "name": name,
            "exchange": "NSE",
            "sector": sec
        })
        stocks.append({
            "symbol": f"{sym}.BO",
            "name": name,
            "exchange": "BSE",
            "sector": sec
        })
        
    return stocks

def main():
    sp500 = fetch_sp500()
    nifty500_data = fetch_nifty500()
    
    all_stocks = []
    
    if sp500:
        all_stocks.extend(sp500)
    
    if nifty500_data:
        nse_stocks, bse_stocks = nifty500_data
        all_stocks.extend(nse_stocks)
        all_stocks.extend(bse_stocks)
        
    # If both failed or are empty, fall back to our massive 400+ list
    if not all_stocks:
        all_stocks = get_fallback_stocks()
    else:
        # If one succeeded but not the other, we can mix some fallback
        has_us = any(s["exchange"] == "US" for s in all_stocks)
        has_in = any(s["exchange"] in ["NSE", "BSE"] for s in all_stocks)
        
        fallback = get_fallback_stocks()
        if not has_us:
            all_stocks.extend([s for s in fallback if s["exchange"] == "US"])
        if not has_in:
            all_stocks.extend([s for s in fallback if s["exchange"] in ["NSE", "BSE"]])
            
    # Remove duplicates by symbol
    seen = set()
    unique_stocks = []
    for s in all_stocks:
        if s["symbol"] not in seen:
            seen.add(s["symbol"])
            unique_stocks.append(s)
            
    # Output the list to backend/stock_catalog.py
    catalog_path = os.path.join(os.path.dirname(__file__), "stock_catalog.py")
    
    print(f"Writing {len(unique_stocks)} stock listings to {catalog_path}...")
    
    with open(catalog_path, "w", encoding="utf-8") as f:
        f.write("# Static stock catalog for US, NSE, and BSE exchanges\n")
        f.write("# Generated automatically using generate_catalog.py\n")
        f.write("# Indian NSE stocks use the '.NS' suffix, and BSE stocks use the '.BO' suffix for yfinance.\n\n")
        f.write("STOCK_CATALOG = [\n")
        
        # Sort stocks by exchange and symbol for nice formatting
        unique_stocks.sort(key=lambda x: (x["exchange"], x["symbol"]))
        
        for stock in unique_stocks:
            # Escape single quotes in names
            clean_name = stock["name"].replace("'", "\\'")
            clean_sector = stock["sector"].replace("'", "\\'")
            f.write(f"    {{\"symbol\": \"{stock['symbol']}\", \"name\": '{clean_name}', \"exchange\": \"{stock['exchange']}\", \"sector\": '{clean_sector}'}},\n")
            
        f.write("]\n")
        
    print("Generation complete!")

if __name__ == "__main__":
    main()
