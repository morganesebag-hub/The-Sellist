#!/bin/sh
# Rebuilds the-sellist-publier.zip (Morgane's extension) from extension-sellist/.
cd "$(dirname "$0")" && rm -f the-sellist-publier.zip && zip -qr the-sellist-publier.zip extension-sellist -x '*.DS_Store' && echo "the-sellist-publier.zip rebuilt"
