{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 function checkText() \{\
  const text = document.getElementById("inputText").value;\
\
  // Simple AI-likeness scoring logic (mock for now)\
  let aiScore = 0;\
\
  const aiIndicators = [\
    "in conclusion",\
    "therefore",\
    "moreover",\
    "in summary",\
    "it is important to note"\
  ];\
\
  aiIndicators.forEach(phrase => \{\
    if (text.toLowerCase().includes(phrase)) \{\
      aiScore += 20;\
    \}\
  \});\
\
  let humanScore = 100 - aiScore;\
\
  document.getElementById("result").innerHTML =\
    `<strong>AI Probability:</strong> $\{aiScore\}%<br><strong>Human Probability:</strong> $\{humanScore\}%`;\
\}\
}
