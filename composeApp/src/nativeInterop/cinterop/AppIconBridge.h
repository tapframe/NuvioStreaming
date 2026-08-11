#pragma once

#include <stdbool.h>

typedef void (*NuvioAppIconCompletion)(bool);

bool NuvioSupportsAlternateAppIcons(void);
bool NuvioIsCurrentAlternateAppIcon(const char *name);
void NuvioSetAlternateAppIconName(const char *name, NuvioAppIconCompletion completion);
