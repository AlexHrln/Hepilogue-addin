#!/bin/sh
# Prépare le manifeste de production à partir de l'adresse d'hébergement.
# Usage : ./configurer.sh https://votre-adresse/hepilogue-addin
set -e
URL="${1%/}"
if [ -z "$URL" ]; then
  echo "Usage : ./configurer.sh https://votre-adresse/hepilogue-addin"
  exit 1
fi
case "$URL" in
  https://*) ;;
  *) echo "L'adresse doit commencer par https://"; exit 1 ;;
esac
cd "$(dirname "$0")"
sed "s#https://localhost:3000#${URL}#g" manifest.xml > manifest-production.xml
echo "Manifeste créé : $(pwd)/manifest-production.xml"
echo "Vérifiez qu'il s'ouvre : ${URL}/src/taskpane.html"
