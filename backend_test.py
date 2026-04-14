#!/usr/bin/env python3
"""
Diagnostic Test for Provider "Cheikh Mécanicien" Not Receiving Requests
=======================================================================

This test investigates why the provider "Cheikh Mécanicien" with an active BASIC subscription
is not receiving any requests on their dashboard.

Test Plan:
1. Find provider "Cheikh Mécanicien" in the database
2. Verify their profile configuration (category, availability, zones)
3. Check their subscription status and details
4. Look for existing "mecanicien" requests in the system
5. Create a test request for "mecanicien" category
6. Verify if the provider receives the test request
7. Check provider's leads history
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

def print_section(title):
    """Print a formatted section header"""
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")

def print_result(test_name, success, details=""):
    """Print test result with formatting"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   {details}")

def make_request(method, endpoint, data=None, params=None):
    """Make HTTP request with error handling"""
    url = f"{API_BASE}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method.upper() == "PATCH":
            response = requests.patch(url, json=data, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None

def find_cheikh_provider():
    """Find the provider 'Cheikh Mécanicien' in the database"""
    print_section("1. RECHERCHE DU PRESTATAIRE 'CHEIKH MÉCANICIEN'")
    
    response = make_request("GET", "/providers")
    if not response or response.status_code != 200:
        print_result("GET /api/providers", False, f"Status: {response.status_code if response else 'No response'}")
        return None
    
    try:
        providers = response.json()
        print_result("GET /api/providers", True, f"Trouvé {len(providers)} prestataires")
        
        # Search for Cheikh or Mécanicien
        cheikh_provider = None
        for provider in providers:
            # Get name from user object and category from serviceCategory
            user_name = provider.get('user', {}).get('name', '') if provider.get('user') else provider.get('businessName', '')
            name = user_name.lower()
            category = provider.get('serviceCategory', '').lower()
            
            if 'cheikh' in name or 'mécanicien' in name or 'mecanicien' in name:
                cheikh_provider = provider
                break
            elif category == 'mecanicien':
                # If we find a mechanic, let's check if it could be Cheikh
                print(f"   Mécanicien trouvé: {user_name} (ID: {provider.get('userId')})")
                if not cheikh_provider:  # Take the first mechanic if no exact match
                    cheikh_provider = provider
        
        if cheikh_provider:
            user_name = cheikh_provider.get('user', {}).get('name', '') if cheikh_provider.get('user') else cheikh_provider.get('businessName', '')
            print_result("Recherche Cheikh Mécanicien", True, f"Trouvé: {user_name}")
            print(f"   📋 Détails du prestataire:")
            print(f"      - Nom: {user_name}")
            print(f"      - ID: {cheikh_provider.get('userId')}")
            print(f"      - Catégorie: {cheikh_provider.get('serviceCategory')}")
            print(f"      - Disponible: {cheikh_provider.get('isAvailable')}")
            print(f"      - Ville: {cheikh_provider.get('city')}")
            print(f"      - Zones: {cheikh_provider.get('zones', [])}")
            print(f"      - Téléphone: {cheikh_provider.get('whatsappNumber')}")
            print(f"      - Tier: {cheikh_provider.get('tier', 'N/A')}")
            return cheikh_provider
        else:
            print_result("Recherche Cheikh Mécanicien", False, "Aucun prestataire 'Cheikh' ou 'Mécanicien' trouvé")
            
            # Show all mechanics for debugging
            mechanics = [p for p in providers if p.get('serviceCategory', '').lower() == 'mecanicien']
            if mechanics:
                print(f"   🔧 Mécaniciens disponibles dans la base:")
                for mech in mechanics:
                    mech_name = mech.get('user', {}).get('name', '') if mech.get('user') else mech.get('businessName', '')
                    print(f"      - {mech_name} (ID: {mech.get('userId')})")
            
            return None
            
    except json.JSONDecodeError:
        print_result("Parse JSON providers", False, "Réponse JSON invalide")
        return None

def check_subscription(provider_id):
    """Check the subscription status for the provider"""
    print_section("2. VÉRIFICATION DE L'ABONNEMENT")
    
    response = make_request("GET", "/subscriptions/my-subscription", params={"providerId": provider_id})
    if not response:
        print_result("GET /api/subscriptions/my-subscription", False, "Pas de réponse")
        return None
    
    if response.status_code != 200:
        print_result("GET /api/subscriptions/my-subscription", False, f"Status: {response.status_code}")
        print(f"   Response: {response.text}")
        return None
    
    try:
        subscription = response.json()
        print_result("GET /api/subscriptions/my-subscription", True, "Abonnement trouvé")
        
        print(f"   📊 Détails de l'abonnement:")
        print(f"      - Status: {subscription.get('status')}")
        print(f"      - Plan: {subscription.get('plan')}")
        print(f"      - Créé le: {subscription.get('createdAt')}")
        print(f"      - Expire le: {subscription.get('expiresAt')}")
        print(f"      - Leads reçus ce mois: {subscription.get('leadsReceivedThisMonth', 0)}")
        
        if subscription.get('plan'):
            plan_details = subscription.get('plan', {})
            print(f"      - Limite leads/mois: {plan_details.get('leadsPerMonth', 'N/A')}")
            print(f"      - Prix: {plan_details.get('price', 'N/A')} FCFA")
        
        return subscription
        
    except json.JSONDecodeError:
        print_result("Parse JSON subscription", False, "Réponse JSON invalide")
        return None

def check_existing_requests():
    """Check if there are any existing 'mecanicien' requests"""
    print_section("3. VÉRIFICATION DES DEMANDES EXISTANTES")
    
    response = make_request("GET", "/requests")
    if not response or response.status_code != 200:
        print_result("GET /api/requests", False, f"Status: {response.status_code if response else 'No response'}")
        return []
    
    try:
        requests_data = response.json()
        print_result("GET /api/requests", True, f"Trouvé {len(requests_data)} demandes")
        
        # Filter for mechanic requests
        mechanic_requests = []
        for req in requests_data:
            category = req.get('serviceCategory', '').lower()
            if 'mecanicien' in category or 'mécanique' in category:
                mechanic_requests.append(req)
        
        print(f"   🔧 Demandes de mécanicien trouvées: {len(mechanic_requests)}")
        
        if mechanic_requests:
            for req in mechanic_requests[:5]:  # Show first 5
                print(f"      - ID: {req.get('id')} | Status: {req.get('status')} | Ville: {req.get('city')} | Créé: {req.get('createdAt', '')[:10]}")
        else:
            print("      Aucune demande de mécanicien trouvée dans le système")
        
        return mechanic_requests
        
    except json.JSONDecodeError:
        print_result("Parse JSON requests", False, "Réponse JSON invalide")
        return []

def create_test_request():
    """Create a test request for 'mecanicien' category"""
    print_section("4. CRÉATION D'UNE DEMANDE DE TEST")
    
    test_data = {
        "serviceCategory": "mecanicien",
        "city": "Dakar",
        "phone": "+221771234567",
        "description": "Test demande mécanique - diagnostic Cheikh",
        "source": "diagnostic_test"
    }
    
    print(f"   📝 Données de test:")
    print(f"      - Service: {test_data['serviceCategory']}")
    print(f"      - Ville: {test_data['city']}")
    print(f"      - Téléphone: {test_data['phone']}")
    print(f"      - Description: {test_data['description']}")
    
    response = make_request("POST", "/leads", data=test_data)
    if not response:
        print_result("POST /api/leads", False, "Pas de réponse")
        return None
    
    if response.status_code != 200:
        print_result("POST /api/leads", False, f"Status: {response.status_code}")
        print(f"   Response: {response.text}")
        return None
    
    try:
        result = response.json()
        print_result("POST /api/leads", True, "Demande de test créée")
        
        print(f"   ✅ Résultat:")
        print(f"      - Success: {result.get('success')}")
        print(f"      - Lead ID: {result.get('leadId')}")
        print(f"      - Request ID: {result.get('requestId')}")
        print(f"      - Providers matchés: {result.get('matchedProviders', 0)}")
        
        return result
        
    except json.JSONDecodeError:
        print_result("Parse JSON lead creation", False, "Réponse JSON invalide")
        return None

def check_provider_leads(provider_id):
    """Check the leads received by the provider"""
    print_section("5. VÉRIFICATION DES LEADS DU PRESTATAIRE")
    
    # Try to get provider leads
    response = make_request("GET", f"/provider/leads", params={"providerId": provider_id})
    if response and response.status_code == 200:
        try:
            leads_data = response.json()
            leads = leads_data.get('leads', []) if isinstance(leads_data, dict) else leads_data
            print_result("GET /api/provider/leads", True, f"Trouvé {len(leads)} leads")
            
            if leads:
                print(f"   📨 Leads reçus:")
                for lead in leads[:5]:  # Show first 5
                    print(f"      - ID: {lead.get('id')} | Service: {lead.get('serviceCategory')} | Status: {lead.get('status')} | Date: {lead.get('createdAt', '')[:10]}")
            else:
                print("      Aucun lead trouvé pour ce prestataire")
            
            return leads
        except json.JSONDecodeError:
            print_result("Parse JSON provider leads", False, "Réponse JSON invalide")
    else:
        print_result("GET /api/provider/leads", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Alternative: Check dashboard data
    print("\n   🔄 Tentative via dashboard API...")
    response = make_request("GET", f"/provider/dashboard/{provider_id}")
    if response and response.status_code == 200:
        try:
            dashboard = response.json()
            print_result("GET /api/provider/dashboard", True, "Dashboard récupéré")
            
            matches = dashboard.get('matches', [])
            print(f"      - Matches trouvés: {len(matches)}")
            
            if matches:
                print(f"   📊 Matches récents:")
                for match in matches[:3]:  # Show first 3
                    print(f"      - Request ID: {match.get('requestId')} | Status: {match.get('status')} | Date: {match.get('createdAt', '')[:10]}")
            
            return matches
        except json.JSONDecodeError:
            print_result("Parse JSON dashboard", False, "Réponse JSON invalide")
    else:
        print_result("GET /api/provider/dashboard", False, f"Status: {response.status_code if response else 'No response'}")
    
    return []

def analyze_matching_logic():
    """Analyze why the matching might not be working"""
    print_section("6. ANALYSE DE LA LOGIQUE DE MATCHING")
    
    # Get all providers to understand matching criteria
    response = make_request("GET", "/providers")
    if not response or response.status_code != 200:
        print_result("Analyse matching", False, "Impossible de récupérer les prestataires")
        return
    
    try:
        providers = response.json()
        mechanics = [p for p in providers if p.get('serviceCategory', '').lower() == 'mecanicien']
        
        print(f"   🔧 Analyse des mécaniciens ({len(mechanics)} trouvés):")
        
        for mech in mechanics:
            mech_name = mech.get('user', {}).get('name', '') if mech.get('user') else mech.get('businessName', '')
            available = mech.get('isAvailable', False)
            city = mech.get('city', 'N/A')
            zones = mech.get('zones', [])
            tier = mech.get('tier', 'free')
            
            print(f"      - {mech_name}:")
            print(f"        ✓ Disponible: {available}")
            print(f"        ✓ Ville: {city}")
            print(f"        ✓ Zones: {zones}")
            print(f"        ✓ Tier: {tier}")
            
            # Check if this provider should match Dakar requests
            should_match_dakar = (
                available and 
                (city.lower() == 'dakar' or 'dakar' in [z.lower() for z in zones])
            )
            print(f"        ➡️ Devrait matcher Dakar: {should_match_dakar}")
        
        print_result("Analyse matching", True, f"{len(mechanics)} mécaniciens analysés")
        
    except json.JSONDecodeError:
        print_result("Analyse matching", False, "Erreur parsing JSON")

def main():
    """Main diagnostic function"""
    print("🔍 DIAGNOSTIC: Pourquoi Cheikh Mécanicien ne reçoit pas de demandes")
    print(f"🌐 API Base URL: {API_BASE}")
    print(f"⏰ Test démarré à: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Step 1: Find the provider
    provider = find_cheikh_provider()
    if not provider:
        print("\n❌ DIAGNOSTIC ARRÊTÉ: Impossible de trouver le prestataire")
        return
    
    provider_id = provider.get('userId')
    if not provider_id:
        print("\n❌ DIAGNOSTIC ARRÊTÉ: ID prestataire manquant")
        return
    
    # Step 2: Check subscription
    subscription = check_subscription(provider_id)
    
    # Step 3: Check existing requests
    existing_requests = check_existing_requests()
    
    # Step 4: Create test request
    test_result = create_test_request()
    
    # Step 5: Check provider leads
    provider_leads = check_provider_leads(provider_id)
    
    # Step 6: Analyze matching logic
    analyze_matching_logic()
    
    # Final summary
    print_section("RÉSUMÉ DU DIAGNOSTIC")
    
    print("📊 ÉTAT DU PRESTATAIRE:")
    user_name = provider.get('user', {}).get('name', '') if provider.get('user') else provider.get('businessName', '')
    print(f"   - Nom: {user_name}")
    print(f"   - Catégorie: {provider.get('serviceCategory')}")
    print(f"   - Disponible: {provider.get('isAvailable')}")
    print(f"   - Ville: {provider.get('city')}")
    print(f"   - Zones: {provider.get('zones', [])}")
    
    if subscription:
        print(f"\n📋 ABONNEMENT:")
        print(f"   - Status: {subscription.get('status')}")
        print(f"   - Plan: {subscription.get('plan', {}).get('name', 'N/A')}")
        print(f"   - Leads reçus: {subscription.get('leadsReceivedThisMonth', 0)}")
    
    print(f"\n🔧 DEMANDES MÉCANICIEN:")
    print(f"   - Existantes: {len(existing_requests)}")
    print(f"   - Test créé: {'✅' if test_result and test_result.get('success') else '❌'}")
    if test_result:
        print(f"   - Providers matchés: {test_result.get('matchedProviders', 0)}")
    
    print(f"\n📨 LEADS PRESTATAIRE:")
    print(f"   - Leads trouvés: {len(provider_leads) if provider_leads else 0}")
    
    # Diagnostic conclusion
    print(f"\n🎯 CONCLUSION:")
    
    issues_found = []
    
    if not provider.get('isAvailable'):
        issues_found.append("❌ Prestataire marqué comme NON DISPONIBLE")
    
    if provider.get('serviceCategory', '').lower() != 'mecanicien':
        issues_found.append(f"❌ Catégorie incorrecte: {provider.get('serviceCategory')} (attendu: mecanicien)")
    
    if subscription and subscription.get('status') != 'ACTIVE':
        issues_found.append(f"❌ Abonnement non actif: {subscription.get('status')}")
    
    if test_result and test_result.get('matchedProviders', 0) == 0:
        issues_found.append("❌ Aucun matching lors du test")
    
    if not issues_found:
        print("   ✅ Aucun problème technique détecté")
        print("   💡 Le prestataire devrait recevoir des demandes")
        print("   🔍 Vérifier s'il y a des demandes récentes de mécanicien dans sa zone")
    else:
        print("   🚨 PROBLÈMES IDENTIFIÉS:")
        for issue in issues_found:
            print(f"      {issue}")
    
    print(f"\n⏰ Diagnostic terminé à: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()