#!/bin/sh

if [ ! -f ".env" ]; then
    cp .env.sample .env
fi

npm install

npm run start:dev
