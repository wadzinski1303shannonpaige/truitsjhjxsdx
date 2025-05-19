(function(){window.CQ=window.CQ||{};
window.CQ.CoreComponents=window.CQ.CoreComponents||{};
window.CQ.CoreComponents.container=window.CQ.CoreComponents.container||{};
window.CQ.CoreComponents.container.utils={};
window.CQ.CoreComponents.container.utils={removeUrlHash:function(){history.replaceState(undefined,undefined," ")
},updateUrlHash:function(c,d,b){if(c&&c._elements&&c._elements[d]&&c._elements[d][b]&&c._elements[d][b].id){var a=c._elements[d][b].id;
history.replaceState(undefined,undefined,"#"+a)
}},getDeepLinkItemIdx:function(b,h,e){if(window.location.hash){var a=window.location.hash.substring(1);
if(a&&document.getElementById(a)&&b&&b._config&&b._config.element&&b._elements[h]&&b._config.element.querySelector("[id='"+a+"']")){for(var c=0;
c<b._elements[h].length;
c++){var d=b._elements[h][c];
var g=false;
if(b._elements[e]){var f=b._elements[e][c];
g=f&&f.querySelector("[id='"+a+"']")
}if(d.id===a||g){return c
}}}return -1
}return -1
},getDeepLinkItem:function(b,d,c){var a=window.CQ.CoreComponents.container.utils.getDeepLinkItemIdx(b,d,c);
if(b&&b._elements&&b._elements[d]){return b._elements[d][a]
}},scrollToAnchor:function(){setTimeout(function(){if(window.location.hash){var b=decodeURIComponent(window.location.hash.substring(1));
var a=document.getElementById(b);
if(a&&a.offsetTop){a.scrollIntoView()
}}},100)
}}
}());